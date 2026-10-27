import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const r2Enabled = () =>
  !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );

function client() {
  if (!r2Enabled()) throw new Error("R2 is not configured.");
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

const bucket = () => process.env.R2_BUCKET!;

export async function presignPut(key: string, mime: string, bytes: number) {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mime, ContentLength: bytes }),
    { expiresIn: 60 * 15 },
  );
}

export async function presignGet(key: string, downloadName: string) {
  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: `inline; filename="${downloadName.replace(/"/g, "")}"`,
    }),
    { expiresIn: 60 * 60 * 24 * 7 },
  );
}

export async function headObject(key: string) {
  return client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function deleteObject(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
