const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const crypto = require("crypto");

// Generate token reset password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    // Validasi input
    if (!email) {
      return res.status(400).json({ error: "Email harus diisi" });
    }

    // Cek apakah user dengan email tersebut ada
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res
        .status(404)
        .json({ error: "User dengan email tersebut tidak ditemukan" });
    }

    // Generate token unik
    const token = crypto.randomBytes(32).toString("hex");

    // Set waktu expired (contoh: 1 jam dari sekarang)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Simpan token ke database
    const resetToken = await prisma.password_reset_tokens.create({
      data: {
        user_id: user.id,
        token: token,
        expires_at: expiresAt,
      },
    });

    // TODO: Kirim email dengan token ke user
    // Anda bisa menggunakan nodemailer atau service email lainnya

    res.status(200).json({
      message: "Link reset password telah dikirim ke email Anda",
      token: token, // Hapus ini di production, hanya untuk testing
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Verifikasi token dan reset password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    // Validasi input
    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "Semua field harus diisi" });
    }

    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ error: "Password dan konfirmasi password tidak cocok" });
    }

    // Cari token di database
    const resetToken = await prisma.password_reset_tokens.findFirst({
      where: {
        token: token,
        expires_at: {
          gte: new Date(), // Token belum expired
        },
      },
      include: {
        user: true,
      },
    });

    if (!resetToken) {
      return res
        .status(400)
        .json({ error: "Token tidak valid atau sudah expired" });
    }

    // Hash password baru (gunakan bcrypt)
    const bcrypt = require("bcrypt");
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password user
    await prisma.user.update({
      where: { id: resetToken.user_id },
      data: { password: hashedPassword },
    });

    // Hapus token setelah digunakan
    await prisma.password_reset_tokens.delete({
      where: { id: resetToken.id },
    });

    res.status(200).json({ message: "Password berhasil direset" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

// Hapus token expired (opsional - bisa dijadwalkan dengan cron job)
router.delete("/cleanup-expired-tokens", async (req, res) => {
  try {
    const result = await prisma.password_reset_tokens.deleteMany({
      where: {
        expires_at: {
          lt: new Date(),
        },
      },
    });

    res.status(200).json({
      message: "Token expired berhasil dihapus",
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Terjadi kesalahan server" });
  }
});

module.exports = router;
