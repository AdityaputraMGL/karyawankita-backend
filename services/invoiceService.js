// services/invoiceService.js
const PDFDocument = require("pdfkit");

class InvoiceService {
  /**
   * Generate Invoice PDF
   */
  generateInvoicePDF(invoiceData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];

        // Collect PDF data
        doc.on("data", buffers.push.bind(buffers));
        doc.on("end", () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Header - Company Info
        doc
          .fontSize(20)
          .fillColor("#667eea")
          .text("INVOICE", 50, 50, { align: "center" })
          .fontSize(10)
          .fillColor("#666")
          .text("HR Management System", { align: "center" })
          .moveDown();

        // Invoice Details
        doc
          .fontSize(12)
          .fillColor("#333")
          .text(`Invoice No: ${invoiceData.order_id}`, 50, 120)
          .text(
            `Tanggal: ${new Date(invoiceData.payment_date).toLocaleDateString(
              "id-ID",
              {
                day: "numeric",
                month: "long",
                year: "numeric",
              }
            )}`,
            50,
            140
          )
          .moveDown();

        // Bill To
        doc
          .fontSize(14)
          .fillColor("#667eea")
          .text("TAGIHAN UNTUK:", 50, 180)
          .fontSize(12)
          .fillColor("#333")
          .text(invoiceData.company_name || "Perusahaan", 50, 200)
          .text(invoiceData.admin_email || "-", 50, 220)
          .moveDown();

        // Line separator
        doc
          .strokeColor("#667eea")
          .lineWidth(2)
          .moveTo(50, 260)
          .lineTo(550, 260)
          .stroke();

        // Table Header
        const tableTop = 280;
        doc
          .fontSize(12)
          .fillColor("#667eea")
          .text("DESKRIPSI", 50, tableTop, { width: 250 })
          .text("HARGA", 300, tableTop, { width: 80, align: "right" })
          .text("JUMLAH", 380, tableTop, { width: 80, align: "right" })
          .text("TOTAL", 460, tableTop, { width: 100, align: "right" });

        // Line under header
        doc
          .strokeColor("#ddd")
          .lineWidth(1)
          .moveTo(50, tableTop + 20)
          .lineTo(550, tableTop + 20)
          .stroke();

        // Table Content
        const contentTop = tableTop + 30;
        const pricePerEmployee = parseFloat(invoiceData.price_per_employee);
        const totalEmployees = invoiceData.total_employees;
        const totalAmount = parseFloat(invoiceData.total_amount);

        doc
          .fontSize(11)
          .fillColor("#333")
          .text(`Subscription ${invoiceData.plan_name}`, 50, contentTop, {
            width: 250,
          })
          .text(
            `Rp ${pricePerEmployee.toLocaleString("id-ID")}`,
            300,
            contentTop,
            { width: 80, align: "right" }
          )
          .text(`${totalEmployees} karyawan`, 380, contentTop, {
            width: 80,
            align: "right",
          })
          .text(`Rp ${totalAmount.toLocaleString("id-ID")}`, 460, contentTop, {
            width: 100,
            align: "right",
          });

        doc
          .fontSize(9)
          .fillColor("#666")
          .text(`Periode: ${invoiceData.period}`, 50, contentTop + 20, {
            width: 250,
          });

        // Line separator
        doc
          .strokeColor("#ddd")
          .lineWidth(1)
          .moveTo(50, contentTop + 50)
          .lineTo(550, contentTop + 50)
          .stroke();

        // Calculation
        const calcTop = contentTop + 70;
        doc
          .fontSize(11)
          .fillColor("#333")
          .text("Perhitungan:", 50, calcTop)
          .fontSize(10)
          .fillColor("#666")
          .text(invoiceData.calculation, 50, calcTop + 20, { width: 400 });

        // Total
        const totalTop = calcTop + 80;
        doc
          .fontSize(14)
          .fillColor("#667eea")
          .text("TOTAL TAGIHAN:", 350, totalTop, { width: 150 })
          .fontSize(16)
          .fillColor("#333")
          .text(
            `Rp ${totalAmount.toLocaleString("id-ID")}`,
            350,
            totalTop + 25,
            {
              width: 200,
              align: "right",
            }
          );

        // Status
        const statusTop = totalTop + 70;
        const statusColor =
          invoiceData.status === "success" ? "#4CAF50" : "#FF9800";
        const statusText =
          invoiceData.status === "success" ? "LUNAS" : "PENDING";

        doc
          .fontSize(12)
          .fillColor(statusColor)
          .text(`Status Pembayaran: ${statusText}`, 50, statusTop, {
            align: "center",
          });

        // Footer
        doc
          .fontSize(9)
          .fillColor("#999")
          .text(
            "Terima kasih atas kepercayaan Anda menggunakan layanan kami",
            50,
            700,
            { align: "center" }
          )
          .text("HR Management System - Powered by Your Company", {
            align: "center",
          });

        // Finalize PDF
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate Invoice Data from Payment
   */
  async prepareInvoiceData(payment, subscription, prisma) {
    try {
      // Get admin user
      const admin = await prisma.user.findUnique({
        where: { user_id: subscription.user_id },
        select: {
          username: true,
          email: true,
        },
      });

      // Parse metadata
      const metadata = payment.metadata
        ? JSON.parse(payment.metadata)
        : {
            plan_name: subscription.plan.plan_name,
            price_per_employee: subscription.plan.price,
            total_employees: 0,
            calculation: "-",
          };

      // Get current period
      const now = new Date();
      const period = `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, "0")}`;

      return {
        order_id: payment.order_id,
        payment_date: payment.payment_date || new Date(),
        company_name: admin.username,
        admin_email: admin.email,
        plan_name: metadata.plan_name,
        price_per_employee: metadata.price_per_employee,
        total_employees: metadata.total_employees,
        total_amount: payment.amount,
        calculation: metadata.calculation,
        period: period,
        status: payment.status,
        transaction_id: payment.transaction_id,
      };
    } catch (error) {
      console.error("Error preparing invoice data:", error);
      throw error;
    }
  }
}

module.exports = InvoiceService;
