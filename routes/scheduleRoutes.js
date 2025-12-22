const express = require("express");
const authMiddleware = require("../middleware/auth");

module.exports = function (prisma) {
  const router = express.Router();

  // ==========================================
  // GET All Work Schedules
  // ==========================================
  router.get(
    "/",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        console.log("📅 Fetching all work schedules...");

        const schedules = await prisma.workSchedule.findMany({
          include: {
            employee_schedules: {
              include: {
                employee: {
                  select: {
                    employee_id: true,
                    nama_lengkap: true,
                    jabatan: true,
                  },
                },
              },
            },
            shift_rotations: true,
          },
          orderBy: { created_at: "desc" },
        });

        console.log(`✅ Found ${schedules.length} schedules`);
        res.json(schedules);
      } catch (error) {
        console.error("❌ Error fetching schedules:", error);
        res.status(500).json({
          error: "Gagal mengambil data jadwal kerja",
          details: error.message,
        });
      }
    }
  );

  // ==========================================
  // GET Schedule by ID
  // ==========================================
  router.get("/:id", authMiddleware.authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;

      const schedule = await prisma.workSchedule.findUnique({
        where: { schedule_id: parseInt(id) },
        include: {
          employee_schedules: {
            include: {
              employee: true,
            },
          },
          shift_rotations: true,
        },
      });

      if (!schedule) {
        return res.status(404).json({ error: "Jadwal tidak ditemukan" });
      }

      res.json(schedule);
    } catch (error) {
      console.error("❌ Error fetching schedule:", error);
      res.status(500).json({
        error: "Gagal mengambil data jadwal",
        details: error.message,
      });
    }
  });

  // ==========================================
  // POST Create New Schedule
  // ==========================================
  router.post(
    "/",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const {
          schedule_name,
          shift_type,
          start_time,
          end_time,
          break_duration,
          work_days,
        } = req.body;

        console.log("📝 Creating new schedule:", schedule_name);

        // Validation
        if (!schedule_name || !start_time || !end_time) {
          return res.status(400).json({
            error: "Nama jadwal, jam masuk, dan jam pulang wajib diisi",
          });
        }

        const newSchedule = await prisma.workSchedule.create({
          data: {
            schedule_name,
            shift_type: shift_type || "Regular",
            start_time,
            end_time,
            break_duration: break_duration || 60,
            work_days: work_days || "Mon-Fri",
            is_active: true,
          },
        });

        console.log("✅ Schedule created:", newSchedule.schedule_id);
        res.status(201).json({
          message: "Jadwal kerja berhasil dibuat",
          data: newSchedule,
        });
      } catch (error) {
        console.error("❌ Error creating schedule:", error);
        res.status(500).json({
          error: "Gagal membuat jadwal kerja",
          details: error.message,
        });
      }
    }
  );

  // ==========================================
  // POST Assign Schedule to Employee
  // ==========================================
  router.post(
    "/assign",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const { employee_id, schedule_id, effective_date, end_date, notes } =
          req.body;

        console.log("📌 Assign request body:", req.body);

        // Validation
        if (!employee_id || !schedule_id || !effective_date) {
          return res.status(400).json({
            error: "Employee ID, Schedule ID, dan tanggal efektif wajib diisi",
          });
        }

        // Convert ke integer
        const empId = parseInt(employee_id);
        const schedId = parseInt(schedule_id);

        // Check if employee exists
        const employee = await prisma.employee.findUnique({
          where: { employee_id: empId },
        });

        if (!employee) {
          return res.status(404).json({
            error: "Karyawan tidak ditemukan",
          });
        }

        // Check if schedule exists
        const schedule = await prisma.workSchedule.findUnique({
          where: { schedule_id: schedId },
        });

        if (!schedule) {
          return res.status(404).json({
            error: "Jadwal tidak ditemukan",
          });
        }

        // Deactivate previous schedules for this employee
        await prisma.employeeSchedule.updateMany({
          where: {
            employee_id: empId,
            is_active: true,
          },
          data: { is_active: false },
        });

        // Create new assignment
        const assignment = await prisma.employeeSchedule.create({
          data: {
            employee_id: empId,
            schedule_id: schedId,
            effective_date: new Date(effective_date),
            end_date: end_date ? new Date(end_date) : null,
            notes: notes || null,
            is_active: true,
          },
          include: {
            employee: {
              select: {
                nama_lengkap: true,
                jabatan: true,
              },
            },
            schedule: true,
          },
        });

        console.log("✅ Schedule assigned successfully");

        res.status(201).json({
          message: `Jadwal berhasil diterapkan untuk ${employee.nama_lengkap}`,
          data: assignment,
        });
      } catch (error) {
        console.error("❌ Error assigning schedule:", error);
        res.status(500).json({
          error: "Gagal menerapkan jadwal",
          details: error.message,
        });
      }
    }
  );

  // ==========================================
  // PUT Update Schedule
  // ==========================================
  router.put(
    "/:id",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const { id } = req.params;
        const updateData = req.body;

        console.log("📝 Updating schedule:", id);

        const existingSchedule = await prisma.workSchedule.findUnique({
          where: { schedule_id: parseInt(id) },
        });

        if (!existingSchedule) {
          return res.status(404).json({ error: "Jadwal tidak ditemukan" });
        }

        const updatedSchedule = await prisma.workSchedule.update({
          where: { schedule_id: parseInt(id) },
          data: updateData,
        });

        console.log("✅ Schedule updated");
        res.json({
          message: "Jadwal berhasil diperbarui",
          data: updatedSchedule,
        });
      } catch (error) {
        console.error("❌ Error updating schedule:", error);
        res.status(500).json({
          error: "Gagal memperbarui jadwal",
          details: error.message,
        });
      }
    }
  );

  // ==========================================
  // DELETE Schedule
  // ==========================================
  router.delete(
    "/:id",
    authMiddleware.authenticateToken,
    authMiddleware.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      try {
        const { id } = req.params;

        console.log("🗑️ Deleting schedule:", id);

        // Check if schedule is being used
        const employeeCount = await prisma.employeeSchedule.count({
          where: { schedule_id: parseInt(id), is_active: true },
        });

        if (employeeCount > 0) {
          return res.status(400).json({
            error: `Tidak dapat menghapus. Jadwal ini sedang digunakan oleh ${employeeCount} karyawan`,
          });
        }

        await prisma.workSchedule.delete({
          where: { schedule_id: parseInt(id) },
        });

        console.log("✅ Schedule deleted");
        res.json({ message: "Jadwal berhasil dihapus" });
      } catch (error) {
        console.error("❌ Error deleting schedule:", error);
        res.status(500).json({
          error: "Gagal menghapus jadwal",
          details: error.message,
        });
      }
    }
  );

  // ==========================================
  // GET Employee's Current Schedule
  // ==========================================
  router.get(
    "/employee/:employee_id",
    authMiddleware.authenticateToken,
    async (req, res) => {
      try {
        const { employee_id } = req.params;
        const { role, employee_id: userEmployeeId } = req.user;

        // Karyawan hanya bisa lihat jadwal mereka sendiri
        if (
          role === "Karyawan" &&
          parseInt(employee_id) !== parseInt(userEmployeeId)
        ) {
          return res.status(403).json({
            error: "Anda hanya dapat melihat jadwal Anda sendiri",
          });
        }

        console.log(`📅 Fetching schedule for employee ${employee_id}`);

        const currentSchedule = await prisma.employeeSchedule.findFirst({
          where: {
            employee_id: parseInt(employee_id),
            is_active: true,
          },
          include: {
            schedule: true,
            employee: {
              select: {
                nama_lengkap: true,
                jabatan: true,
              },
            },
          },
          orderBy: { effective_date: "desc" },
        });

        if (!currentSchedule) {
          return res.status(404).json({
            error: "Jadwal tidak ditemukan untuk karyawan ini",
          });
        }

        res.json(currentSchedule);
      } catch (error) {
        console.error("❌ Error fetching employee schedule:", error);
        res.status(500).json({
          error: "Gagal mengambil jadwal karyawan",
          details: error.message,
        });
      }
    }
  );

  // ==========================================
  // POST Check if Late/Overtime based on schedule
  // ==========================================
  router.post("/check-attendance", async (req, res) => {
    try {
      const { employee_id, check_time, date } = req.body;

      console.log(`⏰ Checking attendance for employee ${employee_id}`);

      // Get employee's active schedule
      const employeeSchedule = await prisma.employeeSchedule.findFirst({
        where: {
          employee_id: parseInt(employee_id),
          is_active: true,
        },
        include: {
          schedule: true,
        },
      });

      if (!employeeSchedule) {
        return res.json({
          hasSchedule: false,
          message: "Karyawan tidak memiliki jadwal aktif",
        });
      }

      const schedule = employeeSchedule.schedule;
      const checkDateTime = new Date(`${date} ${check_time}`);
      const scheduledStart = new Date(`${date} ${schedule.start_time}`);
      const scheduledEnd = new Date(`${date} ${schedule.end_time}`);

      // Calculate if late
      const isLate = checkDateTime > scheduledStart;
      const lateMinutes = isLate
        ? Math.floor((checkDateTime - scheduledStart) / 60000)
        : 0;

      // Calculate if overtime
      const isOvertime = checkDateTime > scheduledEnd;
      const overtimeMinutes = isOvertime
        ? Math.floor((checkDateTime - scheduledEnd) / 60000)
        : 0;

      res.json({
        hasSchedule: true,
        schedule: {
          name: schedule.schedule_name,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
        },
        attendance: {
          check_time,
          is_late: isLate,
          late_minutes: lateMinutes,
          is_overtime: isOvertime,
          overtime_minutes: overtimeMinutes,
        },
      });
    } catch (error) {
      console.error("❌ Error checking attendance:", error);
      res.status(500).json({
        error: "Gagal memeriksa kehadiran",
        details: error.message,
      });
    }
  });

  return router;
};
