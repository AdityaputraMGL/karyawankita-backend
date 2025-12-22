// routes/subscriptionRoutes.js
const express = require("express");
const authMiddleware = require("../middleware/auth");
const MidtransService = require("../services/midtransService");
const InvoiceService = require("../services/invoiceService");

module.exports = function (prisma) {
  const router = express.Router();
  const midtransService = new MidtransService();
  const invoiceService = new InvoiceService();

  // ============================================
  // 📋 GET: Get All Plans (Public)
  // ============================================
  router.get("/plans", async (req, res) => {
    try {
      console.log("📋 Fetching subscription plans...");

      const plans = await prisma.subscriptionPlan.findMany({
        where: { is_active: true },
        orderBy: { price: "asc" },
      });

      console.log(`✅ Found ${plans.length} active plans`);
      res.json(plans);
    } catch (error) {
      console.error("❌ Error fetching plans:", error);
      res.status(500).json({ error: "Gagal memuat paket langganan." });
    }
  });

  // ============================================
  // 🔍 GET: Check Subscription Status
  // ============================================
  router.get("/status", authMiddleware.authenticateToken, async (req, res) => {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;

      console.log("🔍 Checking subscription status for user:", userId);

      // Jika Admin, cek subscription sendiri
      // Jika Karyawan, cek subscription Admin
      let targetUserId = userId;

      if (userRole !== "Admin") {
        const admin = await prisma.user.findFirst({
          where: { role: "Admin" },
        });

        if (!admin) {
          return res.json({
            hasSubscription: false,
            message: "Tidak ada Admin di sistem.",
          });
        }

        targetUserId = admin.user_id;
      }

      const subscription = await prisma.subscription.findUnique({
        where: { user_id: targetUserId },
        include: {
          plan: true,
          payments: {
            orderBy: { created_at: "desc" },
            take: 1,
          },
        },
      });

      if (!subscription) {
        return res.json({
          hasSubscription: false,
          message: "Belum ada subscription.",
        });
      }

      // Check if expired
      const now = new Date();
      const isExpired =
        subscription.end_date && now > new Date(subscription.end_date);

      res.json({
        hasSubscription: true,
        subscription: {
          ...subscription,
          isExpired,
          daysRemaining: subscription.end_date
            ? Math.ceil(
                (new Date(subscription.end_date) - now) / (1000 * 60 * 60 * 24)
              )
            : null,
        },
      });
    } catch (error) {
      console.error("❌ Error checking status:", error);
      res.status(500).json({ error: "Gagal memeriksa status subscription." });
    }
  });

  // ============================================
  // 💳 POST: Create Subscription & Payment
  // ============================================
  router.post(
    "/create",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin"]), // Hanya Admin yang bisa subscribe
    async (req, res) => {
      try {
        const { plan_id } = req.body;
        const userId = req.user.userId;
        const username = req.user.username;
        const email = req.user.email || `${username}@company.com`;

        console.log("💳 Creating subscription...");
        console.log("  - User ID:", userId);
        console.log("  - Plan ID:", plan_id);

        // Validasi
        if (!plan_id) {
          return res.status(400).json({ error: "Plan ID wajib diisi." });
        }

        // Get plan details
        const plan = await prisma.subscriptionPlan.findUnique({
          where: { plan_id: parseInt(plan_id) },
        });

        if (!plan) {
          return res.status(404).json({ error: "Paket tidak ditemukan." });
        }

        if (!plan.is_active) {
          return res.status(400).json({ error: "Paket tidak tersedia." });
        }

        // ✅ HITUNG JUMLAH KARYAWAN AKTIF
        const employeeCount = await prisma.employee.findMany({
          where: {
            user: {
              status: "active", // Hanya hitung karyawan yang statusnya active
            },
          },
        });

        const totalEmployees = employeeCount.length;

        console.log("👥 Total karyawan aktif:", totalEmployees);

        if (totalEmployees === 0) {
          return res.status(400).json({
            error:
              "Tidak ada karyawan aktif. Tambahkan karyawan terlebih dahulu.",
          });
        }

        // ✅ HITUNG TOTAL HARGA: Jumlah Karyawan × Harga Plan
        const pricePerEmployee = parseFloat(plan.price);
        const totalAmount = pricePerEmployee * totalEmployees;

        console.log("💰 Calculation:");
        console.log(
          `  - Price per employee: Rp ${pricePerEmployee.toLocaleString(
            "id-ID"
          )}`
        );
        console.log(`  - Total employees: ${totalEmployees}`);
        console.log(
          `  - Total amount: Rp ${totalAmount.toLocaleString("id-ID")}`
        );

        // Cek apakah sudah punya subscription
        let subscription = await prisma.subscription.findUnique({
          where: { user_id: userId },
        });

        // Jika belum ada, buat baru
        if (!subscription) {
          subscription = await prisma.subscription.create({
            data: {
              user_id: userId,
              plan_id: plan.plan_id,
              status: "pending",
            },
          });
          console.log(
            "✅ New subscription created:",
            subscription.subscription_id
          );
        } else {
          // Update subscription (ganti plan atau perpanjang)
          subscription = await prisma.subscription.update({
            where: { subscription_id: subscription.subscription_id },
            data: {
              plan_id: plan.plan_id,
              status: "pending",
            },
          });
          console.log("✅ Subscription updated:", subscription.subscription_id);
        }

        // Generate unique order ID
        const orderId = `SUB-${userId}-${Date.now()}`;

        // Create payment record dengan TOTAL AMOUNT (bukan harga plan)
        const payment = await prisma.payment.create({
          data: {
            subscription_id: subscription.subscription_id,
            order_id: orderId,
            amount: totalAmount, // ✅ Total setelah dikalikan jumlah karyawan
            status: "pending",
            expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            metadata: JSON.stringify({
              plan_name: plan.plan_name,
              price_per_employee: pricePerEmployee,
              total_employees: totalEmployees,
              calculation: `${totalEmployees} karyawan × Rp ${pricePerEmployee.toLocaleString(
                "id-ID"
              )} = Rp ${totalAmount.toLocaleString("id-ID")}`,
            }),
          },
        });

        console.log("✅ Payment record created:", payment.payment_id);

        // Create Midtrans transaction
        const customerDetails = {
          first_name: username,
          email: email,
        };

        const itemDetails = [
          {
            id: plan.plan_id.toString(),
            price: totalAmount, // ✅ Total amount
            quantity: 1,
            name: `${plan.plan_name} - ${totalEmployees} Karyawan`,
          },
        ];

        const midtransTransaction = await midtransService.createTransaction(
          orderId,
          totalAmount, // ✅ Total amount
          customerDetails,
          itemDetails
        );

        // Update payment dengan snap token & URL
        await prisma.payment.update({
          where: { payment_id: payment.payment_id },
          data: {
            snap_token: midtransTransaction.token,
            snap_url: midtransTransaction.redirect_url,
          },
        });

        console.log("✅ Midtrans transaction created successfully");

        res.json({
          message: "Subscription berhasil dibuat.",
          subscription_id: subscription.subscription_id,
          payment_id: payment.payment_id,
          snap_token: midtransTransaction.token,
          redirect_url: midtransTransaction.redirect_url,
          order_id: orderId,
          amount: totalAmount,
          plan_name: plan.plan_name,
          total_employees: totalEmployees,
          price_per_employee: pricePerEmployee,
          calculation: `${totalEmployees} karyawan × Rp ${pricePerEmployee.toLocaleString(
            "id-ID"
          )} = Rp ${totalAmount.toLocaleString("id-ID")}`,
        });
      } catch (error) {
        console.error("❌ Error creating subscription:", error);
        res.status(500).json({
          error: "Gagal membuat subscription.",
          details: error.message,
        });
      }
    }
  );

  // ============================================
  // 🔔 POST: Midtrans Webhook (Payment Notification)
  // ============================================
  router.post("/webhook", async (req, res) => {
    try {
      console.log("🔔 Midtrans webhook received");
      console.log("  - Notification:", req.body);

      const notification = req.body;

      // Verify notification
      const verifiedData = await midtransService.verifyNotification(
        notification
      );

      console.log("✅ Notification verified:", verifiedData);

      // Find payment
      const payment = await prisma.payment.findUnique({
        where: { order_id: verifiedData.orderId },
        include: { subscription: true },
      });

      if (!payment) {
        console.error("❌ Payment not found:", verifiedData.orderId);
        return res.status(404).json({ error: "Payment tidak ditemukan." });
      }

      // Update payment status
      const updateData = {
        status: verifiedData.transactionStatus,
        transaction_id: verifiedData.transactionId,
        payment_type: verifiedData.paymentType,
      };

      // Jika payment berhasil
      if (
        midtransService.isPaymentSuccess(
          verifiedData.transactionStatus,
          verifiedData.fraudStatus
        )
      ) {
        console.log("✅ Payment SUCCESS");
        updateData.status = "success";
        updateData.payment_date = new Date();

        // Activate subscription
        const plan = await prisma.subscriptionPlan.findUnique({
          where: { plan_id: payment.subscription.plan_id },
        });

        const startDate = new Date();
        const endDate = new Date(
          startDate.getTime() + plan.duration_days * 24 * 60 * 60 * 1000
        );

        await prisma.subscription.update({
          where: { subscription_id: payment.subscription_id },
          data: {
            status: "active",
            start_date: startDate,
            end_date: endDate,
          },
        });

        console.log("✅ Subscription ACTIVATED");
        console.log("  - Start Date:", startDate);
        console.log("  - End Date:", endDate);
      }

      // Jika payment pending
      if (midtransService.isPaymentPending(verifiedData.transactionStatus)) {
        console.log("⏳ Payment PENDING");
        updateData.status = "pending";
      }

      // Jika payment failed
      if (midtransService.isPaymentFailed(verifiedData.transactionStatus)) {
        console.log("❌ Payment FAILED");
        updateData.status = "failed";

        await prisma.subscription.update({
          where: { subscription_id: payment.subscription_id },
          data: { status: "inactive" },
        });
      }

      // Update payment
      await prisma.payment.update({
        where: { payment_id: payment.payment_id },
        data: updateData,
      });

      res.json({ message: "Webhook processed successfully." });
    } catch (error) {
      console.error("❌ Webhook error:", error);
      res.status(500).json({ error: "Gagal memproses webhook." });
    }
  });

  // ============================================
  // 📊 GET: Admin - View All Subscriptions
  // ============================================
  router.get(
    "/admin/all",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin"]),
    async (req, res) => {
      try {
        const subscriptions = await prisma.subscription.findMany({
          include: {
            user: {
              select: {
                username: true,
                email: true,
                role: true,
              },
            },
            plan: true,
            payments: {
              orderBy: { created_at: "desc" },
            },
          },
          orderBy: { created_at: "desc" },
        });

        res.json(subscriptions);
      } catch (error) {
        console.error("❌ Error fetching subscriptions:", error);
        res.status(500).json({ error: "Gagal memuat data subscription." });
      }
    }
  );

  // ============================================
  // 🧾 GET: Current Month Billing (Invoice)
  // ============================================
  router.get(
    "/billing/current",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin"]),
    async (req, res) => {
      try {
        const userId = req.user.userId;

        console.log("🧾 Fetching current billing for user:", userId);

        // Get subscription
        const subscription = await prisma.subscription.findUnique({
          where: { user_id: userId },
          include: {
            plan: true,
            payments: {
              orderBy: { created_at: "desc" },
              take: 1,
            },
          },
        });

        if (!subscription) {
          return res.json({
            hasBilling: false,
            message: "Belum ada subscription.",
          });
        }

        // Count active employees
        const employeeCount = await prisma.employee.findMany({
          where: {
            user: {
              status: "active",
            },
          },
        });

        const totalEmployees = employeeCount.length;
        const pricePerEmployee = parseFloat(subscription.plan.price);
        const totalAmount = pricePerEmployee * totalEmployees;

        // Get current month
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(
          now.getMonth() + 1
        ).padStart(2, "0")}`;

        res.json({
          hasBilling: true,
          billing: {
            period: currentMonth,
            plan_name: subscription.plan.plan_name,
            price_per_employee: pricePerEmployee,
            total_employees: totalEmployees,
            total_amount: totalAmount,
            calculation: `${totalEmployees} karyawan × Rp ${pricePerEmployee.toLocaleString(
              "id-ID"
            )} = Rp ${totalAmount.toLocaleString("id-ID")}`,
            subscription_status: subscription.status,
            start_date: subscription.start_date,
            end_date: subscription.end_date,
            last_payment: subscription.payments[0] || null,
          },
        });
      } catch (error) {
        console.error("❌ Error fetching billing:", error);
        res.status(500).json({ error: "Gagal memuat billing." });
      }
    }
  );

  // ============================================
  // 📄 GET: Download Invoice PDF
  // ============================================
  router.get(
    "/invoice/:payment_id",
    authMiddleware.authenticateToken,
    async (req, res) => {
      try {
        const { payment_id } = req.params;
        const userId = req.user.userId;

        console.log("📄 Generating invoice for payment:", payment_id);

        // Get payment with subscription
        const payment = await prisma.payment.findUnique({
          where: { payment_id: parseInt(payment_id) },
          include: {
            subscription: {
              include: {
                plan: true,
                user: true,
              },
            },
          },
        });

        if (!payment) {
          return res.status(404).json({ error: "Payment tidak ditemukan." });
        }

        // Check authorization
        if (
          req.user.role !== "Admin" &&
          payment.subscription.user_id !== userId
        ) {
          return res.status(403).json({ error: "Akses ditolak." });
        }

        // Prepare invoice data
        const invoiceData = await invoiceService.prepareInvoiceData(
          payment,
          payment.subscription,
          prisma
        );

        // Generate PDF
        const pdfBuffer = await invoiceService.generateInvoicePDF(invoiceData);

        // Send PDF
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=invoice-${payment.order_id}.pdf`
        );
        res.send(pdfBuffer);

        console.log("✅ Invoice generated successfully");
      } catch (error) {
        console.error("❌ Error generating invoice:", error);
        res.status(500).json({
          error: "Gagal generate invoice.",
          details: error.message,
        });
      }
    }
  );

  // ============================================
  // 📄 GET: View Invoice in Browser
  // ============================================
  router.get(
    "/invoice/:payment_id/view",
    authMiddleware.authenticateToken,
    async (req, res) => {
      try {
        const { payment_id } = req.params;
        const userId = req.user.userId;

        // Get payment
        const payment = await prisma.payment.findUnique({
          where: { payment_id: parseInt(payment_id) },
          include: {
            subscription: {
              include: {
                plan: true,
                user: true,
              },
            },
          },
        });

        if (!payment) {
          return res.status(404).json({ error: "Payment tidak ditemukan." });
        }

        // Check authorization
        if (
          req.user.role !== "Admin" &&
          payment.subscription.user_id !== userId
        ) {
          return res.status(403).json({ error: "Akses ditolak." });
        }

        // Prepare invoice data
        const invoiceData = await invoiceService.prepareInvoiceData(
          payment,
          payment.subscription,
          prisma
        );

        // Generate PDF
        const pdfBuffer = await invoiceService.generateInvoicePDF(invoiceData);

        // Display in browser
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
        res.send(pdfBuffer);
      } catch (error) {
        console.error("❌ Error viewing invoice:", error);
        res.status(500).json({ error: "Gagal menampilkan invoice." });
      }
    }
  );

  // =================================================================
  // 🧪 POST: Activate Dummy Subscription (For Testing Only)
  // =================================================================
  router.post(
    "/activate-dummy",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin"]),
    async (req, res) => {
      try {
        const { plan_id } = req.body;
        const userId = req.user.userId;

        console.log("🧪 Activating DUMMY subscription...");
        console.log("  - User ID:", userId);
        console.log("  - Plan ID:", plan_id);

        // Validasi
        if (!plan_id) {
          return res.status(400).json({ error: "Plan ID wajib diisi." });
        }

        // Get plan
        const plan = await prisma.subscriptionPlan.findUnique({
          where: { plan_id: parseInt(plan_id) },
        });

        if (!plan) {
          return res.status(404).json({ error: "Plan tidak ditemukan." });
        }

        // Get employee count
        const employeeCount = await prisma.employee.count({
          where: {
            user: {
              status: "active",
            },
          },
        });

        if (employeeCount === 0) {
          return res.status(400).json({
            error:
              "Tidak ada karyawan aktif. Tambahkan karyawan terlebih dahulu.",
          });
        }

        const pricePerEmployee = parseFloat(plan.price);
        const totalAmount = pricePerEmployee * employeeCount;

        console.log("💰 Calculation:");
        console.log(
          `  - Price per employee: Rp ${pricePerEmployee.toLocaleString(
            "id-ID"
          )}`
        );
        console.log(`  - Total employees: ${employeeCount}`);
        console.log(
          `  - Total amount: Rp ${totalAmount.toLocaleString("id-ID")}`
        );

        // Create or update subscription
        let subscription = await prisma.subscription.findUnique({
          where: { user_id: userId },
        });

        const startDate = new Date();
        const endDate = new Date(
          startDate.getTime() + plan.duration_days * 24 * 60 * 60 * 1000
        );

        if (!subscription) {
          subscription = await prisma.subscription.create({
            data: {
              user_id: userId,
              plan_id: plan.plan_id,
              status: "active",
              start_date: startDate,
              end_date: endDate,
            },
          });
          console.log(
            "✅ New subscription created:",
            subscription.subscription_id
          );
        } else {
          subscription = await prisma.subscription.update({
            where: { subscription_id: subscription.subscription_id },
            data: {
              plan_id: plan.plan_id,
              status: "active",
              start_date: startDate,
              end_date: endDate,
            },
          });
          console.log("✅ Subscription updated:", subscription.subscription_id);
        }

        // Create dummy payment record
        const orderId = `DUMMY-${userId}-${Date.now()}`;
        const payment = await prisma.payment.create({
          data: {
            subscription_id: subscription.subscription_id,
            order_id: orderId,
            amount: totalAmount,
            status: "success",
            payment_type: "dummy",
            transaction_id: `TXN-DUMMY-${Date.now()}`,
            payment_date: new Date(),
            metadata: JSON.stringify({
              plan_name: plan.plan_name,
              price_per_employee: pricePerEmployee,
              total_employees: employeeCount,
              calculation: `${employeeCount} karyawan × Rp ${pricePerEmployee.toLocaleString(
                "id-ID"
              )} = Rp ${totalAmount.toLocaleString("id-ID")}`,
              note: "DUMMY SUBSCRIPTION - FOR TESTING ONLY",
            }),
          },
        });

        console.log("✅ DUMMY payment created:", payment.payment_id);
        console.log("✅ DUMMY subscription activated successfully!");

        res.json({
          message: "Subscription berhasil diaktifkan (DUMMY MODE)",
          subscription: {
            subscription_id: subscription.subscription_id,
            plan_name: plan.plan_name,
            status: "active",
            start_date: startDate,
            end_date: endDate,
          },
          billing: {
            order_id: orderId,
            amount: totalAmount,
            employees: employeeCount,
            calculation: `${employeeCount} karyawan × Rp ${pricePerEmployee.toLocaleString(
              "id-ID"
            )} = Rp ${totalAmount.toLocaleString("id-ID")}`,
          },
        });
      } catch (error) {
        console.error("❌ Error activating dummy subscription:", error);
        res.status(500).json({
          error: "Gagal mengaktifkan subscription",
          details: error.message,
        });
      }
    }
  );

  return router;

  return router;
};
