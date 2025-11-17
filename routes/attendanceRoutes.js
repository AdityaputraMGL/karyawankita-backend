const express = require("express");
const authMiddleware = require("../middleware/auth");

module.exports = function (prisma) {
  const router = express.Router();

  // Helper function untuk normalize employee_id sesuai tipe di database
  function normalizeEmployeeId(employeeId) {
    if (!employeeId && employeeId !== 0) return null;

    // Convert ke integer karena schema expects Int
    const parsed = parseInt(employeeId);

    if (isNaN(parsed)) {
      console.error("⚠️ Invalid employee_id:", employeeId);
      return null;
    }

    return parsed;
  }

  // ✅ GET semua data absensi - ROLE-AWARE dengan ENHANCED DEBUGGING
  router.get("/", authMiddleware.authenticateToken, async (req, res) => {
    try {
      const { role, employee_id } = req.user;

      console.log("\n" + "=".repeat(60));
      console.log("📊 GET /api/attendance - Fetching attendance data");
      console.log("=".repeat(60));
      console.log("👤 User Info:");
      console.log("   - Username:", req.user.username);
      console.log("   - Role:", role);
      console.log("   - Employee ID (raw):", employee_id);
      console.log("   - Employee ID type:", typeof employee_id);

      let whereClause = {};

      // Jika role Karyawan, filter hanya data mereka sendiri
      if (role === "Karyawan") {
        if (!employee_id && employee_id !== 0) {
          console.error("❌ Employee ID tidak ditemukan untuk user ini");
          return res.status(400).json({
            error: "Employee ID tidak ditemukan untuk user ini.",
            debug: {
              username: req.user.username,
              role: role,
              employee_id: employee_id,
            },
          });
        }

        // Normalize employee_id
        const normalizedId = normalizeEmployeeId(employee_id);

        if (normalizedId === null) {
          console.error("❌ Employee ID tidak dapat dinormalisasi");
          return res.status(400).json({
            error: "Employee ID tidak valid.",
            debug: {
              raw_employee_id: employee_id,
              normalized: normalizedId,
            },
          });
        }

        whereClause.employee_id = normalizedId;

        console.log("🔍 Filter Applied:");
        console.log("   - Filtering for employee_id:", normalizedId);
        console.log("   - Type:", typeof normalizedId);
        console.log("   - Where clause:", JSON.stringify(whereClause));
      } else if (role === "Admin" || role === "HR") {
        console.log("👑 Admin/HR access: showing all data");
      } else {
        console.error("❌ Role tidak dikenali:", role);
        return res.status(403).json({
          error: "Role tidak dikenali.",
        });
      }

      console.log("\n🔎 Executing Prisma query...");
      console.log(
        "   Query:",
        JSON.stringify(
          {
            where: whereClause,
            orderBy: { tanggal: "desc" },
            include: { employee: true },
          },
          null,
          2
        )
      );

      const attendanceList = await prisma.attendance.findMany({
        where: whereClause,
        orderBy: { tanggal: "desc" },
        include: {
          employee: true,
        },
      });

      console.log("\n✅ Query executed successfully");
      console.log("📦 Results:");
      console.log("   - Total records found:", attendanceList.length);

      if (attendanceList.length > 0) {
        console.log("   - Sample record:");
        const sample = attendanceList[0];
        console.log("     * attendance_id:", sample.attendance_id);
        console.log(
          "     * employee_id:",
          sample.employee_id,
          "(type:",
          typeof sample.employee_id,
          ")"
        );
        console.log("     * tanggal:", sample.tanggal);
        console.log("     * status:", sample.status);
        console.log(
          "     * employee.nama_lengkap:",
          sample.employee?.nama_lengkap || "N/A"
        );
      } else {
        console.log("   ⚠️ No records found!");

        // Additional debugging - check if ANY attendance exists for this employee
        if (whereClause.employee_id) {
          console.log(
            "\n🔍 Additional Debug - Checking all attendance records..."
          );
          const allAttendance = await prisma.attendance.findMany({
            select: { attendance_id: true, employee_id: true },
          });
          console.log("   - Total attendance in DB:", allAttendance.length);

          const uniqueEmployeeIds = [
            ...new Set(allAttendance.map((a) => a.employee_id)),
          ];
          console.log("   - Unique employee_ids in DB:", uniqueEmployeeIds);
          console.log("   - Looking for:", whereClause.employee_id);
          console.log(
            "   - Match found:",
            uniqueEmployeeIds.includes(whereClause.employee_id) ? "YES" : "NO"
          );
        }
      }

      console.log("=".repeat(60) + "\n");

      res.json(attendanceList);
    } catch (error) {
      console.error("\n" + "❌".repeat(30));
      console.error("❌ Error fetching attendance:");
      console.error("   Message:", error.message);
      console.error("   Stack:", error.stack);
      console.error("❌".repeat(30) + "\n");

      res.status(500).json({
        error: "Gagal mengambil data absensi.",
        details: error.message,
      });
    }
  });

  // ✅ GET absensi by ID - ROLE-AWARE
  router.get("/:id", authMiddleware.authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { role, employee_id } = req.user;

    try {
      const attendance = await prisma.attendance.findUnique({
        where: { attendance_id: parseInt(id) },
        include: {
          employee: true,
        },
      });

      if (!attendance) {
        return res.status(404).json({ error: "Data absensi tidak ditemukan." });
      }

      // Karyawan hanya bisa lihat data mereka sendiri
      const normalizedId = normalizeEmployeeId(employee_id);
      if (role === "Karyawan" && attendance.employee_id !== normalizedId) {
        return res.status(403).json({
          error: "Anda tidak memiliki akses ke data absensi ini.",
        });
      }

      res.json(attendance);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({ error: "Gagal mengambil data absensi." });
    }
  });

  // ✅ POST: Mencatat absensi - ROLE-AWARE
  router.post("/", authMiddleware.authenticateToken, async (req, res) => {
    const { role, employee_id: userEmployeeId } = req.user;
    const {
      employee_id,
      tanggal,
      jam_masuk,
      jam_pulang,
      status,
      tipe_kerja,
      lokasi_masuk, // ✅ Pastikan ada
      lokasi_pulang,
      akurasi_masuk, // ✅ Pastikan ada
      akurasi_pulang,
      recorded_by_role,
    } = req.body;

    try {
      // Validasi employee_id
      if (!employee_id) {
        return res.status(400).json({ error: "employee_id wajib diisi." });
      }

      const normalizedUserId = normalizeEmployeeId(userEmployeeId);
      const normalizedTargetId = normalizeEmployeeId(employee_id);

      // Karyawan hanya bisa mencatat absensi mereka sendiri
      if (role === "Karyawan" && normalizedTargetId !== normalizedUserId) {
        return res.status(403).json({
          error: "Anda hanya dapat mencatat absensi untuk diri sendiri.",
        });
      }

      // Cek apakah employee exists
      const employeeExists = await prisma.employee.findUnique({
        where: { employee_id: normalizedTargetId },
      });

      if (!employeeExists) {
        return res.status(400).json({ error: "Employee tidak ditemukan." });
      }

      // ✅ LOG DATA YANG DITERIMA
      console.log("📥 Creating attendance with data:");
      console.log("   - employee_id:", normalizedTargetId);
      console.log("   - lokasi_masuk:", lokasi_masuk);
      console.log("   - akurasi_masuk:", akurasi_masuk);

      const newAttendance = await prisma.attendance.create({
        data: {
          employee_id: normalizedTargetId,
          tanggal: tanggal ? new Date(tanggal) : new Date(),
          jam_masuk: jam_masuk || null,
          jam_pulang: jam_pulang || null,
          status: status || "hadir",
          tipe_kerja: tipe_kerja || "WFO",
          lokasi_masuk: lokasi_masuk || null, // ✅ SAVE
          lokasi_pulang: lokasi_pulang || null,
          akurasi_masuk: akurasi_masuk ? parseInt(akurasi_masuk) : null, // ✅ SAVE
          akurasi_pulang: akurasi_pulang ? parseInt(akurasi_pulang) : null,
          recorded_by_role: recorded_by_role || role,
        },
        include: {
          employee: true,
        },
      });

      console.log("✅ Attendance saved to DB:", newAttendance.attendance_id);
      console.log("   - lokasi_masuk saved:", newAttendance.lokasi_masuk);
      console.log("   - akurasi_masuk saved:", newAttendance.akurasi_masuk);

      res.status(201).json(newAttendance);
    } catch (error) {
      console.error("❌ Error creating attendance:", error);
      res.status(400).json({
        error: "Gagal mencatat absensi.",
        details: error.message,
      });
    }
  });

  // ✅ PUT: Update absensi - ROLE-AWARE
  router.put("/:id", authMiddleware.authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { role, employee_id: userEmployeeId } = req.user;
    const {
      jam_masuk,
      jam_pulang,
      status,
      tipe_kerja,
      lokasi_masuk,
      lokasi_pulang,
      akurasi_masuk,
      akurasi_pulang,
    } = req.body;

    try {
      const existingAttendance = await prisma.attendance.findUnique({
        where: { attendance_id: parseInt(id) },
      });

      if (!existingAttendance) {
        return res.status(404).json({ error: "Data absensi tidak ditemukan." });
      }

      const normalizedUserId = normalizeEmployeeId(userEmployeeId);

      // Karyawan hanya bisa update absensi mereka sendiri
      if (
        role === "Karyawan" &&
        existingAttendance.employee_id !== normalizedUserId
      ) {
        return res.status(403).json({
          error: "Anda hanya dapat mengupdate absensi diri sendiri.",
        });
      }

      // Build update data object
      const updateData = {};
      if (jam_masuk !== undefined) updateData.jam_masuk = jam_masuk;
      if (jam_pulang !== undefined) updateData.jam_pulang = jam_pulang;
      if (status !== undefined) updateData.status = status;
      if (tipe_kerja !== undefined) updateData.tipe_kerja = tipe_kerja;
      if (lokasi_masuk !== undefined) updateData.lokasi_masuk = lokasi_masuk;
      if (lokasi_pulang !== undefined) updateData.lokasi_pulang = lokasi_pulang;
      if (akurasi_masuk !== undefined)
        updateData.akurasi_masuk = parseInt(akurasi_masuk);
      if (akurasi_pulang !== undefined)
        updateData.akurasi_pulang = parseInt(akurasi_pulang);

      const updatedAttendance = await prisma.attendance.update({
        where: { attendance_id: parseInt(id) },
        data: updateData,
        include: {
          employee: true,
        },
      });

      console.log(`✅ Attendance updated by ${role} for ID ${id}`);
      res.json(updatedAttendance);
    } catch (error) {
      console.error("Error updating attendance:", error);
      res.status(400).json({
        error: "Gagal mengupdate absensi.",
        details: error.message,
      });
    }
  });

  // ✅ POST: Check-in - ROLE-AWARE
  router.post(
    "/checkin",
    authMiddleware.authenticateToken,
    async (req, res) => {
      const { role, employee_id: userEmployeeId } = req.user;
      const {
        employee_id,
        jam_masuk,
        tipe_kerja,
        lokasi_masuk,
        akurasi_masuk,
      } = req.body;
      const today = new Date().toISOString().slice(0, 10);

      try {
        let targetEmployeeId;

        if (role === "Karyawan") {
          targetEmployeeId = normalizeEmployeeId(userEmployeeId);
        } else if (role === "Admin" || role === "HR") {
          if (!employee_id) {
            return res.status(400).json({ error: "employee_id wajib diisi." });
          }
          targetEmployeeId = normalizeEmployeeId(employee_id);
        } else {
          return res.status(403).json({ error: "Role tidak dikenali." });
        }

        if (!targetEmployeeId) {
          return res
            .status(400)
            .json({ error: "employee_id tidak dapat ditentukan." });
        }

        // Cek apakah sudah absen hari ini
        const existingAttendance = await prisma.attendance.findFirst({
          where: {
            employee_id: targetEmployeeId,
            tanggal: {
              gte: new Date(today),
              lt: new Date(
                new Date(today).setDate(new Date(today).getDate() + 1)
              ),
            },
          },
        });

        if (existingAttendance) {
          return res.status(400).json({
            error: "Sudah melakukan check-in hari ini.",
          });
        }

        const newAttendance = await prisma.attendance.create({
          data: {
            employee_id: targetEmployeeId,
            tanggal: new Date(today),
            jam_masuk:
              jam_masuk ||
              new Date().toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            tipe_kerja: tipe_kerja || "WFO",
            lokasi_masuk: lokasi_masuk || null,
            akurasi_masuk: akurasi_masuk ? parseInt(akurasi_masuk) : null,
            status: "hadir",
            recorded_by_role: role,
          },
          include: {
            employee: true,
          },
        });

        console.log(
          `✅ Check-in successful by ${role} for employee ${targetEmployeeId}`
        );
        res.status(201).json(newAttendance);
      } catch (error) {
        console.error("Error creating attendance:", error);
        res.status(400).json({
          error: "Gagal mencatat check-in.",
          details: error.message,
        });
      }
    }
  );

  // ✅ PUT: Check-out - ROLE-AWARE
  router.put(
    "/checkout/:id",
    authMiddleware.authenticateToken,
    async (req, res) => {
      const { id } = req.params;
      const { role, employee_id: userEmployeeId } = req.user;
      const { jam_pulang, lokasi_pulang, akurasi_pulang } = req.body;

      try {
        const existingAttendance = await prisma.attendance.findUnique({
          where: { attendance_id: parseInt(id) },
        });

        if (!existingAttendance) {
          return res
            .status(404)
            .json({ error: "Data absensi tidak ditemukan." });
        }

        const normalizedUserId = normalizeEmployeeId(userEmployeeId);

        // Karyawan hanya bisa check-out untuk diri sendiri
        if (
          role === "Karyawan" &&
          existingAttendance.employee_id !== normalizedUserId
        ) {
          return res.status(403).json({
            error: "Anda hanya dapat check-out untuk diri sendiri.",
          });
        }

        if (existingAttendance.jam_pulang) {
          return res.status(400).json({
            error: "Sudah melakukan check-out.",
          });
        }

        const updatedAttendance = await prisma.attendance.update({
          where: { attendance_id: parseInt(id) },
          data: {
            jam_pulang:
              jam_pulang ||
              new Date().toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            lokasi_pulang: lokasi_pulang || null,
            akurasi_pulang: akurasi_pulang ? parseInt(akurasi_pulang) : null,
          },
          include: {
            employee: true,
          },
        });

        console.log(`✅ Check-out successful by ${role} for ID ${id}`);
        res.json(updatedAttendance);
      } catch (error) {
        console.error("Error updating attendance:", error);
        res.status(400).json({
          error: "Gagal mencatat check-out.",
          details: error.message,
        });
      }
    }
  );

  // ✅ DELETE: Hapus absensi - HANYA ADMIN & HR
  router.delete(
    "/:id",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      const { id } = req.params;

      try {
        const existingAttendance = await prisma.attendance.findUnique({
          where: { attendance_id: parseInt(id) },
        });

        if (!existingAttendance) {
          return res
            .status(404)
            .json({ error: "Data absensi tidak ditemukan." });
        }

        await prisma.attendance.delete({
          where: { attendance_id: parseInt(id) },
        });

        console.log(`✅ Attendance deleted by ${req.user.role} - ID: ${id}`);
        res.json({ message: "Absensi berhasil dihapus." });
      } catch (error) {
        console.error("Error deleting attendance:", error);
        res.status(400).json({
          error: "Gagal menghapus absensi.",
          details: error.message,
        });
      }
    }
  );

  // ✅ PUT: Approval status absensi - HANYA ADMIN & HR
  router.put(
    "/approval/:id",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      const { id } = req.params;
      const { status_approval } = req.body;

      try {
        const existingAttendance = await prisma.attendance.findUnique({
          where: { attendance_id: parseInt(id) },
        });

        if (!existingAttendance) {
          return res
            .status(404)
            .json({ error: "Data absensi tidak ditemukan." });
        }

        const approvedAttendance = await prisma.attendance.update({
          where: { attendance_id: parseInt(id) },
          data: { status_approval },
          include: {
            employee: true,
          },
        });

        console.log(`✅ Attendance approved by ${req.user.role} - ID: ${id}`);
        res.json(approvedAttendance);
      } catch (error) {
        console.error("Error approving attendance:", error);
        res.status(400).json({
          error: "Gagal memperbarui status approval absensi.",
          details: error.message,
        });
      }
    }
  );

  // ✅ GET: Absensi berdasarkan employee_id - ROLE-AWARE
  router.get(
    "/employee/:employee_id",
    authMiddleware.authenticateToken,
    async (req, res) => {
      const { employee_id } = req.params;
      const { role, employee_id: userEmployeeId } = req.user;

      try {
        const normalizedParamId = normalizeEmployeeId(employee_id);
        const normalizedUserId = normalizeEmployeeId(userEmployeeId);

        // Karyawan hanya bisa lihat data mereka sendiri
        if (role === "Karyawan" && normalizedParamId !== normalizedUserId) {
          return res.status(403).json({
            error: "Anda hanya dapat melihat data absensi diri sendiri.",
          });
        }

        const attendanceList = await prisma.attendance.findMany({
          where: { employee_id: normalizedParamId },
          orderBy: { tanggal: "desc" },
          include: {
            employee: true,
          },
        });

        console.log(
          `✅ Fetched ${attendanceList.length} records for employee ${normalizedParamId}`
        );
        res.json(attendanceList);
      } catch (error) {
        console.error("Error fetching attendance:", error);
        res.status(500).json({ error: "Gagal mengambil data absensi." });
      }
    }
  );

  return router;
};
