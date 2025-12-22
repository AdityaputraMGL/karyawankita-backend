const express = require("express");
const jwt = require("jsonwebtoken");

const JWT_SECRET =
  process.env.JWT_SECRET || "ganti_dengan_secret_key_yang_kuat";

module.exports = function (prisma, passport) {
  const router = express.Router();

  // ✅ Initiate Google OAuth
  router.get(
    "/google",
    passport.authenticate("google", {
      scope: ["profile", "email"],
      session: false,
    })
  );

  // ✅ Google OAuth Callback
  router.get(
    "/google/callback",
    passport.authenticate("google", {
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_auth_failed`,
    }),
    async (req, res) => {
      try {
        const user = req.user;

        console.log("✅ Google OAuth successful for:", user.username);

        // ✅ CEK APAKAH DATA EMPLOYEE SUDAH LENGKAP DULU
        const employee = await prisma.employee.findUnique({
          where: { user_id: user.user_id },
        });

        const needsCompletion =
          !employee?.jabatan ||
          employee?.jabatan === "-" ||
          !employee?.alamat ||
          employee?.alamat === "-" ||
          !employee?.no_hp ||
          employee?.no_hp === "-";

        console.log("📋 User status:", user.status);
        console.log("📋 Needs completion:", needsCompletion);

        // Generate JWT token (diperlukan untuk semua skenario)
        const token = jwt.sign(
          {
            userId: user.user_id,
            username: user.username,
            role: user.role,
            employee_id: employee?.employee_id || null,
            nama_lengkap: employee?.nama_lengkap || user.username,
            status: user.status,
          },
          JWT_SECRET,
          { expiresIn: "24h" }
        );

        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

        // ✅ PRIORITAS 1: Jika data belum lengkap, langsung ke form (tidak peduli status)
        if (needsCompletion) {
          console.log(
            "⚠️ User needs to complete profile - redirecting to form"
          );
          return res.redirect(`${frontendUrl}/complete-profile?token=${token}`);
        }

        // ✅ PRIORITAS 2: Jika data sudah lengkap, baru cek status

        // BLOCK PENDING USERS
        if (user.status === "pending") {
          console.log(
            "⚠️ Login blocked - Profile complete but status: pending"
          );
          return res.redirect(`${frontendUrl}/login?error=account_pending`);
        }

        // BLOCK REJECTED USERS
        if (user.status === "rejected") {
          console.log("⚠️ Login blocked - User status: rejected");
          return res.redirect(`${frontendUrl}/login?error=account_rejected`);
        }

        // ONLY ALLOW ACTIVE USERS
        if (user.status !== "active") {
          console.log("⚠️ Login blocked - Invalid status:", user.status);
          return res.redirect(`${frontendUrl}/login?error=invalid_status`);
        }

        // ✅ PRIORITAS 3: Status active + data lengkap = redirect ke dashboard
        console.log(
          "✅ Profile complete & status active - redirecting to dashboard"
        );
        res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
      } catch (error) {
        console.error("❌ Error in Google callback:", error);
        res.redirect(
          `${process.env.FRONTEND_URL}/login?error=token_generation_failed`
        );
      }
    }
  );

  return router;
};
