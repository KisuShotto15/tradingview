"use client";

import { createClient } from "./client";

/** Storage bucket holding chart snapshots (see 04_snapshots.sql). */
const BUCKET = "snapshots";

export interface UploadedSnapshot {
  /** Public URL — paste-able into a journal that expects an image link. */
  url: string;
  /** Storage path, kept so the snapshot can be deleted later. */
  path: string;
}

/**
 * Upload a snapshot PNG and return its public URL.
 *
 * Objects are namespaced per user (`<uid>/<file>`), which is what the bucket's
 * RLS policies key on: a user may only write under their own prefix, while
 * reads are public so the link works anywhere it's pasted.
 */
export async function uploadSnapshot(
  blob: Blob,
  filename: string,
): Promise<UploadedSnapshot> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to upload snapshots.");

  const path = `${user.id}/${filename}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/png",
    // Snapshot names carry a timestamp, so a clash means the same chart was
    // captured twice in the same minute — overwrite rather than fail.
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
