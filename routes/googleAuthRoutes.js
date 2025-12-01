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

        // ✅ CEK APAKAH DATA EMPLOYEE SUDAH LENGKAP
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

        // Generate JWT token
        const token = jwt.sign(
          {
            userId: user.user_id,
            username: user.username,
            role: user.role,
            employee_id: employee?.employee_id || null,
            nama_lengkap: employee?.nama_lengkap || user.username,
          },
          JWT_SECRET,
          { expiresIn: "24h" }
        );

        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

        // ✅ REDIRECT KE FORM PELENGKAP JIKA DATA BELUM LENGKAP
        if (needsCompletion) {
          console.log("⚠️ User needs to complete profile");
          return res.redirect(`${frontendUrl}/complete-profile?token=${token}`);
        }

        // Redirect ke dashboard jika data sudah lengkap
        console.log("✅ Profile complete, redirecting to dashboard");
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
