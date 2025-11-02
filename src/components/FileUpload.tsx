import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { encrypt, verifyEncryption, deriveKeyFromRoomId } from "@/lib/crypto";

interface FileUploadProps {
  roomId: string;
  onUploadComplete: () => void;
  encryptionKey: string | null;
  isPasswordKey: boolean;
  disabled?: boolean;
  refreshTrigger?: number; // Pass shares.length or timestamp to trigger refetch
}

const MAX_TOTAL_FILE_SIZE = 20 * 1024 * 1024; // 20MB total limit per room
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file limit

export function FileUpload({ roomId, onUploadComplete, encryptionKey, isPasswordKey, disabled, refreshTrigger }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [totalFileSize, setTotalFileSize] = useState<number>(0);
  const [remainingSpace, setRemainingSpace] = useState<number>(MAX_TOTAL_FILE_SIZE);

  // Fetch current total file size for the room
  const fetchTotalFileSize = async () => {
    try {
      const { data, error } = await supabase
        .from("shares")
        .select("file_size")
        .eq("room_id", roomId)
        .eq("type", "file");

      if (error) throw error;

      const total = data?.reduce((sum, share) => sum + (share.file_size || 0), 0) || 0;
      setTotalFileSize(total);
      setRemainingSpace(Math.max(0, MAX_TOTAL_FILE_SIZE - total));
    } catch (error) {
      console.error("Error fetching total file size:", error);
    }
  };

  useEffect(() => {
    if (roomId) {
      fetchTotalFileSize();
    }
  }, [roomId, refreshTrigger]); // Refetch when refreshTrigger changes (e.g., after deletion)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (disabled) {
      toast.error("This room is view-only");
      return;
    }

    // Check individual file size (10MB limit per file)
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size must be less than 10MB");
      return;
    }

    // Check total room file size limit (20MB total)
    const newTotal = totalFileSize + file.size;
    if (newTotal > MAX_TOTAL_FILE_SIZE) {
      const usedMB = (totalFileSize / (1024 * 1024)).toFixed(2);
      const remainingMB = (remainingSpace / (1024 * 1024)).toFixed(2);
      toast.error(`Total file size limit (20MB) exceeded. Used: ${usedMB}MB, Remaining: ${remainingMB}MB`);
      return;
    }

    // For public rooms: ensure encryption key is set (derive from room ID if missing)
    let finalEncryptionKey = encryptionKey;
    let finalIsPasswordKey = isPasswordKey;
    
    if (!isPasswordKey && !encryptionKey && roomId) {
      finalEncryptionKey = await deriveKeyFromRoomId(roomId);
      finalIsPasswordKey = false;
    }

    // Validate encryption for password-protected rooms
    if (finalIsPasswordKey && !finalEncryptionKey) {
      toast.error("Password required to encrypt file name");
      return;
    }

    setUploading(true);

    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${roomId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("droply-files")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage.from("droply-files").getPublicUrl(fileName);

      // Always encrypt file metadata
      // For public rooms: use room ID-derived key
      // For private rooms: use password-derived key
      const encryptedFileName = await encrypt(file.name, finalEncryptionKey, finalIsPasswordKey, roomId);
      
      // Always verify encryption succeeded
      if (!verifyEncryption(encryptedFileName, file.name)) {
        throw new Error("Encryption failed - file name cannot be saved unencrypted");
      }

      // Create share entry
      const { error: shareError } = await supabase.from("shares").insert({
        room_id: roomId,
        type: "file",
        file_name: encryptedFileName,
        file_url: data.publicUrl,
        file_size: file.size,
        file_type: file.type,
      });

      if (shareError) throw shareError;

      // Update total file size after successful upload
      setTotalFileSize(newTotal);
      setRemainingSpace(MAX_TOTAL_FILE_SIZE - newTotal);

      toast.success("File uploaded!");
      onUploadComplete();
      
      // Refetch to ensure we have accurate data after any deletions
      await fetchTotalFileSize();
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Failed to upload file");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
      <input
        type="file"
        id="file-upload"
        className="hidden"
        onChange={handleFileUpload}
        disabled={uploading || disabled}
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {uploading ? "Uploading..." : "Click to upload or drag and drop"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Max file: 10MB • Room limit: 20MB total
              {remainingSpace < MAX_TOTAL_FILE_SIZE && (
                <span className="ml-2 text-primary">
                  ({(remainingSpace / (1024 * 1024)).toFixed(2)}MB remaining)
                </span>
              )}
            </p>
          </div>
          {uploading && (
            <div className="w-full max-w-xs h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary animate-pulse" style={{ width: "100%" }} />
            </div>
          )}
        </div>
      </label>
    </div>
  );
}