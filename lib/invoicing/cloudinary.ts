import { v2 as cloudinary } from "cloudinary";

export function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary credentials missing: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET"
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

export async function uploadPdfToCloudinary(
  buffer: Buffer,
  companyId: string,
  invoiceId: string
): Promise<string> {
  configureCloudinary();

  const dataUri = `data:application/pdf;base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: "raw",
    folder: "invoices",
    public_id: `${companyId}/${invoiceId}`,
    type: "upload",
  });

  if (!result?.secure_url) {
    throw new Error("No URL returned from Cloudinary");
  }

  return result.secure_url;
}
