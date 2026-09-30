import multer from "multer";

const storage = multer.memoryStorage();

export const upload = multer({
	storage,
	limits: { fileSize: 50 * 1024 * 1024 },
	fileFilter: (_req, file, callback) => {
		if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
			callback(null, true);
		} else {
			callback(Object.assign(new Error("Only image and video uploads are allowed"), { status: 400 }));
		}
	},
});