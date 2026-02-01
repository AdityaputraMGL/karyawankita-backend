const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const JWT_SECRET =
  process.env.JWT_SECRET || "ganti_dengan_secret_key_yang_kuat";

// Middleware untuk verify token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token tidak ditemukan" });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("❌ Token verification error:", err);
      return res
        .status(403)
        .json({ error: "Token tidak valid: " + err.message });
    }
    req.user = decoded;
    next();
  });
};

// ✅ POST /api/complete-profile
router.post("/complete-profile", authenticateToken, async (req, res) => {
  try {
    const { jabatan, alamat, no_hp, status_karyawan, jenis_kelamin, password } =
      req.body;

    // ✅ FIX: Ambil userId dari token (support berbagai format)
    const userId = req.user.userId || req.user.user_id || req.user.id;
    const employeeId = req.user.employee_id;

    console.log("📝 Completing profile for:");
    console.log("   - User ID:", userId);
    console.log("   - Employee ID:", employeeId);
    console.log("   - Data:", {
      jabatan,
      status_karyawan,
      jenis_kelamin,
      no_hp,
      alamat,
    });
    console.log(
      "   - Password provided:",
      password ? "YES (will be set)" : "NO (Google login only)"
    );

    // Validasi input
    if (!jabatan || !alamat || !no_hp || !status_karyawan || !jenis_kelamin) {
      return res.status(400).json({
        error: "Semua field wajib diisi",
        missing: {
          jabatan: !jabatan,
          alamat: !alamat,
          no_hp: !no_hp,
          status_karyawan: !status_karyawan,
          jenis_kelamin: !jenis_kelamin,
        },
      });
    }

    if (!employeeId) {
      return res.status(400).json({
        error: "Employee ID tidak ditemukan. Silakan login ulang.",
      });
    }

    // ✅ 1. Update Employee Data
    await prisma.employee.update({
      where: { employee_id: employeeId },
      data: {
        jabatan,
        alamat,
        no_hp,
        status_karyawan,
        jenis_kelamin,
      },
    });
    console.log("✅ Employee data updated");

    // ✅ 2. Update Password (jika diisi)
    if (password && password.trim().length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 10);

      await prisma.user.update({
        where: { user_id: userId },
        data: { password: hashedPassword },
      });
      console.log("✅ Password has been set - user can now login manually");
    } else {
      console.log(
        "⚠️  Password not provided - user can only login with Google"
      );
    }

    console.log("✅ Profile completed successfully!");

    // ✅ 3. Get updated user data
    const updatedUser = await prisma.user.findUnique({
      where: { user_id: userId },
      include: { employee: true },
    });

    // ✅ 4. Generate token baru dengan data lengkap
    const newToken = jwt.sign(
      {
        userId: userId,
        employee_id: employeeId,
        username: updatedUser.username,
        role: updatedUser.role,
        nama_lengkap:
          updatedUser.employee?.nama_lengkap || updatedUser.username,
        profile_complete: true,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Profil berhasil dilengkapi",
      token: newToken,
      redirect: "/dashboard",
    });
  } catch (error) {
    console.error("❌ Error completing profile:", error);
    res.status(500).json({
      error: "Gagal menyimpan profil",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

module.exports = router;
