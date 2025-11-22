const express = require("express");
const auth = require("../middleware/auth");

module.exports = function (prisma) {
  const router = express.Router();

  // =================================================================
  // GET semua employees (Hanya Admin & HR yang diizinkan)
  // =================================================================
  router.get(
    "/",
    auth.authenticateToken,
    auth.authorizeRole(["Admin", "HR", "Karyawan"]),
    async (req, res) => {
      try {
        // ✅ FIXED: employee (singular) bukan employees
        const employees = await prisma.employee.findMany({
          include: {
            user: true, // ✅ FIXED: user (singular) sesuai schema
          },
        });
        res.json(employees);
      } catch (error) {
        console.error("Error fetching employees:", error);
        res.status(500).json({
          error: "Gagal mengambil data karyawan.",
          details: error.message,
        });
      }
    }
  );

  // =================================================================
  // GET employee berdasarkan ID
  // =================================================================
  router.get("/:id", auth.authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id);
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;

    // Validasi ID
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID tidak valid." });
    }

    try {
      // ✅ FIXED: employee (singular)
      const employee = await prisma.employee.findUnique({
        where: { employee_id: id },
        include: { user: true }, // ✅ FIXED: user (singular)
      });

      if (!employee) {
        return res.status(404).json({ error: "Karyawan tidak ditemukan." });
      }

      // Otorisasi
      const isSelf = employee.user_id === currentUserId;

      if (currentUserRole !== "Admin" && currentUserRole !== "HR" && !isSelf) {
        return res.status(403).json({
          error: "Akses ditolak. Anda hanya dapat melihat data Anda sendiri.",
        });
      }

      res.json(employee);
    } catch (error) {
      console.error("Error fetching employee:", error);
      res.status(500).json({
        error: "Gagal mengambil data karyawan.",
        details: error.message,
      });
    }
  });

  // =================================================================
  // POST: Buat employee baru
  // =================================================================
  router.post(
    "/",
    auth.authenticateToken,
    auth.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      const {
        nama_lengkap,
        alamat,
        no_hp,
        jabatan,
        tanggal_masuk,
        status_karyawan,
        gaji_pokok,
        user_id,
      } = req.body;

      // Validasi input yang wajib
      if (!nama_lengkap) {
        return res.status(400).json({
          error: "Nama lengkap wajib diisi.",
        });
      }

      try {
        // Validasi user_id jika ada
        if (user_id) {
          // ✅ FIXED: user (singular)
          const userExists = await prisma.user.findUnique({
            where: { user_id: parseInt(user_id) },
          });

          if (!userExists) {
            return res.status(400).json({
              error: "User ID tidak ditemukan.",
            });
          }
        }

        // Prepare data
        const employeeData = {
          nama_lengkap: nama_lengkap.trim(),
          alamat: alamat?.trim() || null,
          no_hp: no_hp?.trim() || null,
          jabatan: jabatan?.trim() || null,
          tanggal_masuk: tanggal_masuk ? new Date(tanggal_masuk) : new Date(),
          status_karyawan: status_karyawan || "Tetap",
          gaji_pokok: gaji_pokok ? parseFloat(gaji_pokok) : 5000000.0,
        };

        // Tambahkan user_id jika ada
        if (user_id) {
          employeeData.user_id = parseInt(user_id);
        }

        // ✅ FIXED: employee (singular)
        const newEmployee = await prisma.employee.create({
          data: employeeData,
          include: {
            user: true, // ✅ FIXED: user (singular)
          },
        });

        console.log("Employee created successfully:", newEmployee.employee_id);
        res.status(201).json({
          message: "Karyawan berhasil ditambahkan.",
          data: newEmployee,
        });
      } catch (error) {
        console.error("Error creating employee:", error);

        // Handle specific Prisma errors
        if (error.code === "P2002") {
          return res.status(400).json({
            error: "Data karyawan sudah ada (duplikat).",
            details: error.message,
          });
        }

        if (error.code === "P2003") {
          return res.status(400).json({
            error: "User ID tidak valid atau tidak ditemukan.",
            details: error.message,
          });
        }

        res.status(400).json({
          error: "Gagal menambahkan karyawan.",
          details: error.message,
        });
      }
    }
  );

  // =================================================================
  // PUT: Update employee
  // =================================================================
  router.put(
    "/:id",
    auth.authenticateToken,
    auth.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      const id = parseInt(req.params.id);
      const {
        nama_lengkap,
        alamat,
        no_hp,
        jabatan,
        tanggal_masuk,
        status_karyawan,
        gaji_pokok,
      } = req.body;

      // Validasi ID
      if (isNaN(id)) {
        return res.status(400).json({ error: "ID tidak valid." });
      }

      try {
        // Cek apakah employee ada
        // ✅ FIXED: employee (singular)
        const existingEmployee = await prisma.employee.findUnique({
          where: { employee_id: id },
        });

        if (!existingEmployee) {
          return res.status(404).json({ error: "Karyawan tidak ditemukan." });
        }

        // Prepare update data (hanya field yang diisi)
        const updateData = {};
        if (nama_lengkap !== undefined)
          updateData.nama_lengkap = nama_lengkap.trim();
        if (alamat !== undefined) updateData.alamat = alamat?.trim() || null;
        if (no_hp !== undefined) updateData.no_hp = no_hp?.trim() || null;
        if (jabatan !== undefined) updateData.jabatan = jabatan?.trim() || null;
        if (tanggal_masuk !== undefined)
          updateData.tanggal_masuk = new Date(tanggal_masuk);
        if (status_karyawan !== undefined)
          updateData.status_karyawan = status_karyawan;
        if (gaji_pokok !== undefined)
          updateData.gaji_pokok = parseFloat(gaji_pokok);

        // ✅ FIXED: employee (singular)
        const updatedEmployee = await prisma.employee.update({
          where: { employee_id: id },
          data: updateData,
          include: {
            user: true, // ✅ FIXED: user (singular)
          },
        });

        res.json({
          message: "Data karyawan berhasil diperbarui.",
          data: updatedEmployee,
        });
      } catch (error) {
        console.error("Error updating employee:", error);
        res.status(400).json({
          error: "Gagal memperbarui data karyawan.",
          details: error.message,
        });
      }
    }
  );

  // =================================================================
  // DELETE employee
  // =================================================================
  router.delete(
    "/:id",
    auth.authenticateToken,
    auth.authorizeRole(["Admin", "HR"]),
    async (req, res) => {
      const id = parseInt(req.params.id);

      // Validasi ID
      if (isNaN(id)) {
        return res.status(400).json({ error: "ID tidak valid." });
      }

      try {
        // Cek apakah employee ada
        // ✅ FIXED: employee (singular)
        const existingEmployee = await prisma.employee.findUnique({
          where: { employee_id: id },
        });

        if (!existingEmployee) {
          return res.status(404).json({ error: "Karyawan tidak ditemukan." });
        }

        // ✅ FIXED: employee (singular)
        await prisma.employee.delete({
          where: { employee_id: id },
        });

        res.json({
          message: "Karyawan berhasil dihapus.",
          deleted_id: id,
        });
      } catch (error) {
        console.error("Error deleting employee:", error);

        // Handle foreign key constraint
        if (error.code === "P2003") {
          return res.status(400).json({
            error:
              "Tidak dapat menghapus karyawan. Data masih digunakan di tabel lain.",
            details: error.message,
          });
        }

        res.status(500).json({
          error: "Gagal menghapus karyawan.",
          details: error.message,
        });
      }
    }
  );

  return router;
};
