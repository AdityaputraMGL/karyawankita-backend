const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

module.exports = function (prisma) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "http://localhost:5000/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          console.log("🔍 Google OAuth callback received");
          console.log("  - Profile ID:", profile.id);
          console.log("  - Email:", profile.emails[0].value);

          const email = profile.emails[0].value;
          const displayName = profile.displayName;

          // Cek apakah user sudah ada berdasarkan email
          let user = await prisma.user.findUnique({
            where: { email },
            include: { employee: true },
          });

          if (user) {
            console.log("✅ Existing user found:", user.username);
            return done(null, user);
          }

          // Buat user baru
          console.log("🆕 Creating new user from Google account");

          // Generate username dari email (tanpa angka random)
          const username = email.split("@")[0];

          // ✅ PERBAIKAN: SET PASSWORD KOSONG - USER AKAN SET DI COMPLETE PROFILE
          user = await prisma.user.create({
            data: {
              username,
              email,
              password: "", // ⚠️ Empty string = belum set password
              role: "Karyawan",
              status_karyawan: "Magang",
            },
          });

          // Buat employee record
          const employee = await prisma.employee.create({
            data: {
              user_id: user.user_id,
              nama_lengkap: displayName,
              status_karyawan: "-",
              gaji_pokok: 5000000.0,
              tanggal_masuk: new Date(),
              jabatan: "-",
              alamat: "-",
              no_hp: "-",
            },
          });

          console.log("✅ New user created:", user.username);
          console.log("✅ Employee created:", employee.employee_id);
          console.log(
            "⚠️  Password: NOT SET (empty) - user must set in Complete Profile"
          );

          // Attach employee to user object
          user.employee = employee;

          return done(null, user);
        } catch (error) {
          console.error("❌ Google OAuth error:", error);
          return done(error, null);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.user_id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { user_id: id },
        include: { employee: true },
      });
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  return passport;
};
