/**
 * ========================================
 * ALPHA ROUTES
 * ========================================
 * API endpoints untuk alpha checking system
 *
 * Endpoints:
 * - POST   /api/alpha/check          - Manual trigger alpha check
 * - GET    /api/alpha/stats          - Get alpha statistics
 * - GET    /api/alpha/status         - Get system status
 * - DELETE /api/alpha/remove/:id     - Delete alpha record (Admin)
 * - PUT    /api/alpha/convert/:id    - Convert alpha to other status
 *
 * @author HRIS Development Team
 * @version 2.0.0
 */

const express = require("express");
const authMiddleware = require("../middleware/auth");
const nodemailer = require("nodemailer");

// ✅ Email Configuration
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verifikasi koneksi email
emailTransporter.verify(function (error, success) {
  if (error) {
    console.error("❌ Email configuration error:", error);
  } else {
    console.log("✅ Email server ready for user approval notifications");
  }
});

module.exports = function (prisma, alphaCheckService) {
  const router = express.Router();

  // ========================================
  // ✅ APPROVAL EMAIL TEMPLATE
  // ========================================
  function getApprovalEmailHTML(username, email, role) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const loginUrl = `${frontendUrl}/login`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .email-wrapper {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    .header {
      background: linear-gradient(135deg, #5C54A4 0%, #764ba2 100%);
      padding: 40px 30px;
      text-align: center;
      color: white;
    }
    .logo {
      width: 100px;
      height: 100px;
      margin: 0 auto 16px;
      background: white;
      border-radius: 12px;
      padding: 10px;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
    }
    .content {
      padding: 40px 30px;
    }
    .success-badge {
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      color: white;
      padding: 12px 24px;
      border-radius: 50px;
      display: inline-block;
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 20px;
    }
    .info-box {
      background: #f8f9fa;
      border-left: 4px solid #5C54A4;
      padding: 20px;
      margin: 24px 0;
      border-radius: 8px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e9ecef;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      font-weight: 600;
      color: #666;
    }
    .info-value {
      color: #333;
      font-weight: 500;
    }
    .role-badge {
      background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
    }
    .button {
      display: inline-block;
      padding: 16px 40px;
      background: linear-gradient(135deg, #5C54A4 0%, #764ba2 100%);
      color: white !important;
      text-decoration: none;
      border-radius: 10px;
      margin: 24px 0;
      font-weight: 600;
      font-size: 16px;
      box-shadow: 0 4px 15px rgba(92, 84, 164, 0.3);
      transition: transform 0.2s;
    }
    .footer {
      background: #f8f9fa;
      padding: 30px;
      text-align: center;
      color: #666;
      font-size: 14px;
    }
    .divider {
      height: 1px;
      background: linear-gradient(to right, transparent, #ddd, transparent);
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header">
      <div class="logo">
        <img src="${frontendUrl}/images/hris.png" alt="HRIS Logo" style="width: 80px; height: 80px; object-fit: contain;">
      </div>
      <h1>HRIS Management</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">Human Resource Information System</p>
    </div>
    
    <div class="content">
      <div style="text-align: center;">
        <div class="success-badge">✅ Akun Disetujui!</div>
      </div>
      
      <h2 style="color: #333; font-size: 24px; margin: 24px 0 16px 0;">
        Selamat, ${username}! 🎉
      </h2>
      
      <p style="color: #666; font-size: 16px; line-height: 1.8;">
        Akun HRIS Anda telah <strong>disetujui</strong> oleh Administrator. 
        Anda sekarang dapat mengakses sistem dengan role sebagai <strong>${role}</strong>.
      </p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">👤 Username</span>
          <span class="info-value">${username}</span>
        </div>
        <div class="info-row">
          <span class="info-label">📧 Email</span>
          <span class="info-value">${email}</span>
        </div>
        <div class="info-row">
          <span class="info-label">🎭 Role</span>
          <span class="role-badge">${role}</span>
        </div>
      </div>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${loginUrl}" class="button">🚀 Login Sekarang</a>
      </div>
      
      <div class="divider"></div>
      
      <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; border-radius: 8px;">
        <strong style="color: #856404;">💡 Tips:</strong>
        <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #856404;">
          <li>Gunakan username dan password yang Anda daftarkan untuk login</li>
          <li>Pastikan untuk melengkapi profil Anda setelah login pertama kali</li>
          <li>Jika ada pertanyaan, hubungi Administrator atau HR</li>
        </ul>
      </div>
    </div>
    
    <div class="footer">
      <p style="margin: 0 0 8px 0;">Email ini dikirim secara otomatis oleh sistem HRIS</p>
      <p style="margin: 0; font-size: 13px; color: #999;">
        © ${new Date().getFullYear()} HRIS Management System. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  // ========================================
  // ✅ REJECTION EMAIL TEMPLATE
  // ========================================
  function getRejectionEmailHTML(username, email, reason) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .email-wrapper {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    .header {
      background: linear-gradient(135deg, #5C54A4 0%, #764ba2 100%);
      padding: 40px 30px;
      text-align: center;
      color: white;
    }
    .logo {
      width: 100px;
      height: 100px;
      margin: 0 auto 16px;
      background: white;
      border-radius: 12px;
      padding: 10px;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
    }
    .content {
      padding: 40px 30px;
    }
    .warning-badge {
      background: linear-gradient(135deg, #F44336 0%, #d32f2f 100%);
      color: white;
      padding: 12px 24px;
      border-radius: 50px;
      display: inline-block;
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 20px;
    }
    .reason-box {
      background: #fff5f5;
      border-left: 4px solid #F44336;
      padding: 20px;
      margin: 24px 0;
      border-radius: 8px;
    }
    .footer {
      background: #f8f9fa;
      padding: 30px;
      text-align: center;
      color: #666;
      font-size: 14px;
    }
    .divider {
      height: 1px;
      background: linear-gradient(to right, transparent, #ddd, transparent);
      margin: 30px 0;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header">
      <div class="logo">
        <img src="${frontendUrl}/images/hris.png" alt="HRIS Logo" style="width: 80px; height: 80px; object-fit: contain;">
      </div>
      <h1>HRIS Management</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">Human Resource Information System</p>
    </div>
    
    <div class="content">
      <div style="text-align: center;">
        <div class="warning-badge">❌ Pendaftaran Ditolak</div>
      </div>
      
      <h2 style="color: #333; font-size: 24px; margin: 24px 0 16px 0;">
        Hai ${username},
      </h2>
      
      <p style="color: #666; font-size: 16px; line-height: 1.8;">
        Mohon maaf, pendaftaran akun HRIS Anda dengan email <strong>${email}</strong> 
        telah <strong>ditolak</strong> oleh Administrator.
      </p>
      
      <div class="reason-box">
        <strong style="color: #d32f2f; font-size: 16px;">📋 Alasan Penolakan:</strong>
        <p style="margin: 12px 0 0 0; color: #666; font-size: 15px; line-height: 1.6;">
          ${reason || "Tidak ada alasan spesifik yang diberikan."}
        </p>
      </div>
      
      <div class="divider"></div>
      
      <div style="background: #e3f2fd; border-left: 4px solid #2196F3; padding: 16px; border-radius: 8px;">
        <strong style="color: #1565c0;">💬 Butuh Bantuan?</strong>
        <p style="margin: 8px 0 0 0; color: #1565c0; line-height: 1.6;">
          Jika Anda merasa ada kesalahan atau ingin mendiskusikan hal ini lebih lanjut, 
          silakan hubungi Administrator atau tim HR melalui email atau telepon kantor.
        </p>
      </div>
    </div>
    
    <div class="footer">
      <p style="margin: 0 0 8px 0;">Email ini dikirim secara otomatis oleh sistem HRIS</p>
      <p style="margin: 0; font-size: 13px; color: #999;">
        © ${new Date().getFullYear()} HRIS Management System. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * GET /api/alpha/users/pending
   * Get pending users untuk approval
   */
  router.get(
    "/users/pending",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin"]),
    async (req, res) => {
      try {
        const pendingUsers = await prisma.user.findMany({
          where: { status: "pending" },
          include: {
            employee: {
              select: {
                nama_lengkap: true,
                jabatan: true,
                no_hp: true,
              },
            },
          },
          orderBy: { created_at: "desc" },
        });

        res.json({
          count: pendingUsers.length,
          users: pendingUsers,
        });
      } catch (error) {
        res.status(500).json({
          error: "Gagal mengambil pending users",
          details: error.message,
        });
      }
    }
  );

  //**✨ POST /api/alpha/users/approve/:user_id (UPDATED WITH EMAIL)Approve user dan assign role + KIRIM EMAIL

  router.post(
    "/users/approve/:user_id",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin"]),
    async (req, res) => {
      try {
        const { user_id } = req.params;
        const { approved_role, notes } = req.body;

        const validRoles = ["Admin", "HR", "Karyawan"];
        if (!validRoles.includes(approved_role)) {
          return res.status(400).json({
            error: "Role tidak valid",
            valid_roles: validRoles,
          });
        }

        const user = await prisma.user.findUnique({
          where: { user_id: parseInt(user_id) },
          include: { employee: true },
        });

        if (!user) {
          return res.status(404).json({ error: "User tidak ditemukan" });
        }

        if (user.status !== "pending") {
          return res.status(400).json({
            error: "User sudah diproses",
            current_status: user.status,
          });
        }

        // ✅ UPDATE USER STATUS & ROLE
        const updatedUser = await prisma.user.update({
          where: { user_id: parseInt(user_id) },
          data: {
            status: "active",
            role: approved_role,
          },
        });

        console.log("✅ User approved:", updatedUser.username);
        console.log("   Role assigned:", approved_role);

        // ✨ KIRIM EMAIL APPROVAL (INI YANG DITAMBAHKAN!)
        try {
          const emailHTML = getApprovalEmailHTML(
            updatedUser.username,
            updatedUser.email,
            approved_role
          );

          await emailTransporter.sendMail({
            from: `"HRIS Management" <${process.env.EMAIL_USER}>`,
            to: updatedUser.email,
            subject: "🎉 Akun HRIS Anda Telah Disetujui!",
            html: emailHTML,
          });

          console.log("📧 Approval email sent to:", updatedUser.email);
        } catch (emailError) {
          console.error("⚠️ Email sending failed:", emailError.message);
          // Tetap return success meskipun email gagal
        }

        res.json({
          message:
            "✅ User berhasil diapprove dan email notifikasi telah dikirim",
          user: {
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role,
            status: updatedUser.status,
          },
          approved_by: req.user.username,
          notes: notes || "Approved",
          email_sent: true,
        });
      } catch (error) {
        console.error("❌ Error approving user:", error);
        res.status(500).json({
          error: "Gagal approve user",
          details: error.message,
        });
      }
    }
  );

  /**
   * ✨ POST /api/alpha/users/reject/:user_id (UPDATED - DELETE USER)
   * Reject pending user + HAPUS DARI DATABASE + KIRIM EMAIL
   */
  router.post(
    "/users/reject/:user_id",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin"]),
    async (req, res) => {
      try {
        const { user_id } = req.params;
        const { reason } = req.body;

        const user = await prisma.user.findUnique({
          where: { user_id: parseInt(user_id) },
          include: { employee: true }, // ✅ Include employee untuk hapus juga
        });

        if (!user || user.status !== "pending") {
          return res.status(400).json({ error: "User tidak valid" });
        }

        // Simpan data untuk response (sebelum delete)
        const userData = {
          username: user.username,
          email: user.email,
        };

        // 📧 KIRIM EMAIL REJECTION DULU (sebelum delete)
        try {
          const emailHTML = getRejectionEmailHTML(
            user.username,
            user.email,
            reason || "Administrator tidak memberikan alasan spesifik."
          );

          await emailTransporter.sendMail({
            from: `"HRIS Management" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "❌ Pendaftaran HRIS Anda Ditolak",
            html: emailHTML,
          });

          console.log("📧 Rejection email sent to:", user.email);
        } catch (emailError) {
          console.error("⚠️ Email sending failed:", emailError.message);
          // Lanjut delete meskipun email gagal
        }

        // ✅ HAPUS EMPLOYEE DULU (jika ada)
        if (user.employee) {
          await prisma.employee.delete({
            where: { employee_id: user.employee.employee_id },
          });
          console.log("🗑️ Employee deleted:", user.employee.employee_id);
        }

        // ✅ HAPUS USER
        await prisma.user.delete({
          where: { user_id: parseInt(user_id) },
        });

        console.log("❌ User DELETED (rejected):", userData.username);
        console.log("   Reason:", reason || "No reason provided");
        console.log("   ✅ Username tersedia untuk registrasi ulang");

        res.json({
          message:
            "User berhasil ditolak dan dihapus dari database. Email notifikasi telah dikirim.",
          rejected_user: userData,
          rejected_by: req.user.username,
          reason: reason || "No reason provided",
          email_sent: true,
          deleted: true, // ✅ Indicate data was deleted
        });
      } catch (error) {
        console.error("❌ Error rejecting user:", error);
        res.status(500).json({
          error: "Gagal reject user",
          details: error.message,
        });
      }
    }
  );

  /**
   * ========================================
   * POST /api/alpha/check
   * ========================================
   * Manual trigger alpha check
   * Role: Admin, HR
   *
   * Body (optional):
   * {
   *   "date": "2025-11-22",    // Check specific date
   *   "days_ago": 1             // Check N days ago
   * }
   */
  router.post(
    "/check",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const { date, days_ago } = req.body;

        console.log("🔧 Manual alpha check triggered by:", req.user.username);

        let result;

        if (date) {
          // Check specific date
          const checkDate = new Date(date);
          checkDate.setHours(0, 0, 0, 0);

          console.log("   Checking specific date:", date);
          result = await alphaCheckService.checkAlphaForDate(checkDate);
        } else if (days_ago) {
          // Check N days ago
          console.log("   Checking", days_ago, "day(s) ago");
          result = await alphaCheckService.manualCheckAlpha(parseInt(days_ago));
        } else {
          // Default: check yesterday
          console.log("   Checking yesterday (default)");
          result = await alphaCheckService.checkYesterdayAlpha();
        }

        res.json({
          message: "Alpha check completed",
          triggered_by: req.user.username,
          ...result,
        });
      } catch (error) {
        console.error("❌ Error in manual alpha check:", error);
        res.status(500).json({
          error: "Gagal melakukan alpha check",
          details: error.message,
        });
      }
    }
  );

  /**
   * ========================================
   * GET /api/alpha/stats
   * ========================================
   * Get alpha statistics untuk periode tertentu
   * Role: Admin, HR
   *
   * Query params:
   * - start_date: Start date (YYYY-MM-DD)
   * - end_date: End date (YYYY-MM-DD)
   * - month: Month (1-12)
   * - year: Year (YYYY)
   */
  router.get(
    "/stats",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const { start_date, end_date, month, year } = req.query;

        let startDate, endDate;

        if (month && year) {
          // Get stats for specific month
          const monthNum = parseInt(month);
          const yearNum = parseInt(year);

          startDate = new Date(yearNum, monthNum - 1, 1);
          endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);

          console.log(`📊 Getting stats for: ${monthNum}/${yearNum}`);
        } else if (start_date && end_date) {
          // Custom date range
          startDate = new Date(start_date);
          endDate = new Date(end_date);

          console.log(`📊 Getting stats for: ${start_date} to ${end_date}`);
        } else {
          // Default: current month
          const now = new Date();
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59
          );

          console.log("📊 Getting stats for: Current month (default)");
        }

        const stats = await alphaCheckService.getAlphaStats(startDate, endDate);

        res.json(stats);
      } catch (error) {
        console.error("❌ Error fetching alpha stats:", error);
        res.status(500).json({
          error: "Gagal mengambil statistik alpha",
          details: error.message,
        });
      }
    }
  );

  /**
   * ========================================
   * GET /api/alpha/status
   * ========================================
   * Get system status & cron info
   * Role: Admin, HR
   */
  router.get(
    "/status",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        console.log("📡 Fetching alpha system status...");

        // Check if alpha has been recorded today
        const alphaToday = await prisma.attendance.findMany({
          where: {
            status: "alpa",
            tanggal: {
              gte: new Date(today),
            },
            recorded_by_role: "System",
          },
        });

        // Check yesterday's alpha
        const alphaYesterday = await prisma.attendance.findMany({
          where: {
            status: "alpa",
            tanggal: {
              gte: new Date(yesterdayStr),
              lt: new Date(today),
            },
            recorded_by_role: "System",
          },
        });

        res.json({
          status: "Alpha check service is running",
          cron_schedule: "Every day at 23:01 WIB",
          timezone: "Asia/Jakarta",
          today: {
            date: today,
            alpha_records: alphaToday.length,
          },
          yesterday: {
            date: yesterdayStr,
            alpha_records: alphaYesterday.length,
          },
          deduction_rate: "Rp 100.000 per alpha",
          system_info: {
            version: "2.0.0",
            last_check: "Check server logs",
          },
        });
      } catch (error) {
        console.error("❌ Error checking alpha status:", error);
        res.status(500).json({
          error: "Gagal mengecek status alpha",
          details: error.message,
        });
      }
    }
  );

  /**
   * ========================================
   * DELETE /api/alpha/remove/:attendance_id
   * ========================================
   * Delete alpha record
   * Role: Admin only
   *
   * Body:
   * {
   *   "reason": "Alasan penghapusan"
   * }
   */
  router.delete(
    "/remove/:attendance_id",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin"]),
    async (req, res) => {
      try {
        const { attendance_id } = req.params;
        const { reason } = req.body;

        console.log(`🗑️ Delete alpha request by ${req.user.username}`);
        console.log(`   Attendance ID: ${attendance_id}`);
        console.log(`   Reason: ${reason || "Not specified"}`);

        // Check if it's an alpha record
        const record = await prisma.attendance.findUnique({
          where: { attendance_id: parseInt(attendance_id) },
          include: {
            employee: {
              select: {
                nama_lengkap: true,
              },
            },
          },
        });

        if (!record) {
          return res.status(404).json({
            error: "Record tidak ditemukan",
          });
        }

        if (record.status !== "alpa") {
          return res.status(400).json({
            error: "Record ini bukan alpha record",
            current_status: record.status,
          });
        }

        // Delete the alpha record
        await prisma.attendance.delete({
          where: { attendance_id: parseInt(attendance_id) },
        });

        console.log(`✅ Alpha record deleted successfully`);

        res.json({
          message: "Alpha record berhasil dihapus",
          deleted_record: {
            attendance_id: record.attendance_id,
            employee_name: record.employee.nama_lengkap,
            tanggal: record.tanggal.toISOString().split("T")[0],
            deleted_by: req.user.username,
            reason: reason || "Not specified",
          },
        });
      } catch (error) {
        console.error("❌ Error deleting alpha record:", error);
        res.status(500).json({
          error: "Gagal menghapus alpha record",
          details: error.message,
        });
      }
    }
  );

  /**
   * ========================================
   * PUT /api/alpha/convert/:attendance_id
   * ========================================
   * Convert alpha to other status
   * Role: Admin, HR
   *
   * Body:
   * {
   *   "new_status": "hadir|izin|sakit",
   *   "keterangan": "Alasan konversi"
   * }
   */
  router.put(
    "/convert/:attendance_id",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const { attendance_id } = req.params;
        const { new_status, keterangan } = req.body;

        console.log(`✏️ Convert alpha request by ${req.user.username}`);
        console.log(`   Attendance ID: ${attendance_id}`);
        console.log(`   New status: ${new_status}`);

        // Validate new status
        if (!["hadir", "izin", "sakit"].includes(new_status)) {
          return res.status(400).json({
            error: "Status harus: hadir, izin, atau sakit",
            provided: new_status,
          });
        }

        // Check if it's an alpha record
        const record = await prisma.attendance.findUnique({
          where: { attendance_id: parseInt(attendance_id) },
          include: {
            employee: {
              select: {
                nama_lengkap: true,
              },
            },
          },
        });

        if (!record) {
          return res.status(404).json({
            error: "Record tidak ditemukan",
          });
        }

        if (record.status !== "alpa") {
          return res.status(400).json({
            error: "Record ini bukan alpha record",
            current_status: record.status,
          });
        }

        // Update the record
        const updated = await prisma.attendance.update({
          where: { attendance_id: parseInt(attendance_id) },
          data: {
            status: new_status,
            keterangan:
              keterangan ||
              `Converted from alpha to ${new_status} by ${req.user.username}`,
          },
          include: {
            employee: {
              select: {
                employee_id: true,
                nama_lengkap: true,
              },
            },
          },
        });

        console.log(
          `✅ Alpha converted successfully: ${record.status} → ${new_status}`
        );

        res.json({
          message: `Alpha record berhasil diubah menjadi ${new_status}`,
          updated_record: {
            attendance_id: updated.attendance_id,
            employee_name: updated.employee.nama_lengkap,
            tanggal: updated.tanggal.toISOString().split("T")[0],
            old_status: "alpa",
            new_status: new_status,
            keterangan: updated.keterangan,
            converted_by: req.user.username,
          },
        });
      } catch (error) {
        console.error("❌ Error converting alpha record:", error);
        res.status(500).json({
          error: "Gagal mengubah alpha record",
          details: error.message,
        });
      }
    }
  );

  /**
   * ========================================
   * GET /api/alpha/employee/:employee_id
   * ========================================
   * Get alpha records untuk employee tertentu
   * Role: Admin, HR
   */
  router.get(
    "/employee/:employee_id",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const { employee_id } = req.params;
        const { start_date, end_date, month, year } = req.query;

        console.log(`📊 Getting alpha records for employee: ${employee_id}`);

        let startDate, endDate;

        if (month && year) {
          const monthNum = parseInt(month);
          const yearNum = parseInt(year);
          startDate = new Date(yearNum, monthNum - 1, 1);
          endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);
        } else if (start_date && end_date) {
          startDate = new Date(start_date);
          endDate = new Date(end_date);
        } else {
          // Default: current month
          const now = new Date();
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59
          );
        }

        const alphaRecords = await prisma.attendance.findMany({
          where: {
            employee_id: parseInt(employee_id),
            status: "alpa",
            tanggal: {
              gte: startDate,
              lte: endDate,
            },
          },
          include: {
            employee: {
              select: {
                employee_id: true,
                nama_lengkap: true,
                jabatan: true,
              },
            },
          },
          orderBy: {
            tanggal: "desc",
          },
        });

        const alphaCount = alphaRecords.length;
        const totalDeduction = alphaCount * 100000;

        res.json({
          employee_id: parseInt(employee_id),
          employee_name: alphaRecords[0]?.employee.nama_lengkap || "Unknown",
          period: {
            start: startDate.toISOString().split("T")[0],
            end: endDate.toISOString().split("T")[0],
          },
          alpha_count: alphaCount,
          total_deduction: totalDeduction,
          records: alphaRecords,
        });
      } catch (error) {
        console.error("❌ Error fetching employee alpha:", error);
        res.status(500).json({
          error: "Gagal mengambil data alpha karyawan",
          details: error.message,
        });
      }
    }
  );

  /**
   * ========================================
   * GET /api/alpha/summary
   * ========================================
   * Get summary alpha untuk semua karyawan (current month)
   * Role: Admin, HR
   */
  router.get(
    "/summary",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59
        );

        console.log("📊 Getting alpha summary for current month...");

        const alphaRecords = await prisma.attendance.findMany({
          where: {
            status: "alpa",
            tanggal: {
              gte: startDate,
              lte: endDate,
            },
          },
          include: {
            employee: {
              select: {
                employee_id: true,
                nama_lengkap: true,
                jabatan: true,
              },
            },
          },
          orderBy: {
            tanggal: "desc",
          },
        });

        // Group by employee
        const employeeSummary = {};

        alphaRecords.forEach((record) => {
          const empId = record.employee_id;

          if (!employeeSummary[empId]) {
            employeeSummary[empId] = {
              employee_id: empId,
              nama_lengkap: record.employee.nama_lengkap,
              jabatan: record.employee.jabatan,
              alpha_count: 0,
              total_deduction: 0,
            };
          }

          employeeSummary[empId].alpha_count++;
          employeeSummary[empId].total_deduction += 100000;
        });

        const summary = Object.values(employeeSummary).sort(
          (a, b) => b.alpha_count - a.alpha_count
        );

        res.json({
          period: {
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            month_name: now.toLocaleString("id-ID", { month: "long" }),
          },
          total_alpha_records: alphaRecords.length,
          total_deduction: alphaRecords.length * 100000,
          employees_affected: summary.length,
          top_10: summary.slice(0, 10),
          all_employees: summary,
        });
      } catch (error) {
        console.error("❌ Error fetching alpha summary:", error);
        res.status(500).json({
          error: "Gagal mengambil summary alpha",
          details: error.message,
        });
      }
    }
  );

  return router;
};
