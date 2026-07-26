import { supabase } from "@/integrations/supabase/client";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB

export async function uploadImages(bucket: "purchase-images" | "payment-images", files: File[]): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    if (!ALLOWED.includes(file.type)) throw new Error(`Unsupported file type: ${file.name}`);
    if (file.size > MAX_SIZE) throw new Error(`${file.name} exceeds 8MB limit`);
    const ext = file.name.split(".").pop() || "bin";
    const key = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(key, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    paths.push(key);
  }
  return paths;
}

export async function signedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function signedUrls(bucket: string, paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
  if (error) throw error;
  return (data || []).map((d) => d.signedUrl || "");
}
