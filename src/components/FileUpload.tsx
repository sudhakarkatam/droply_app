import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { encrypt, verifyEncryption } from "@/lib/crypto";

interface FileUploadProps {
  roomId: string;
  onUploadComplete: () => void;
  encryptionKey: string | null;
  isPasswordKey: boolean;
  disabled?: boolean;
}

export function FileUpload({ roomId, onUploadComplete, encryptionKey, isPasswordKey, disabled }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (disabled) {
      toast.error("This room is view-only");
      return;
    }

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    // Validate encryption for password-protected rooms
    if (isPasswordKey && !encryptionKey) {
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

      // Encrypt file metadata
      let encryptedFileName: string;
      if (isPasswordKey && encryptionKey) {
        encryptedFileName = await encrypt(file.name, encryptionKey, isPasswordKey);
        // Verify encryption succeeded
        if (!verifyEncryption(encryptedFileName, file.name)) {
          throw new Error("Encryption failed - file name cannot be saved unencrypted");
        }
      } else {
        encryptedFileName = file.name; // No encryption for non-password rooms
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

      toast.success("File uploaded!");
      onUploadComplete();
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
            <p className="text-xs text-muted-foreground mt-1">Max file size: 10MB</p>
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