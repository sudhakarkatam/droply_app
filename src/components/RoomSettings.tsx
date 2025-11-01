import { useState, useEffect } from "react";
import { Settings, Eye, Edit, Shield, Key, ChevronDown, ChevronUp, Lock, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CustomExpiryPicker } from "@/components/CustomExpiryPicker";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface RoomSettingsProps {
  room: any;
  isPasswordProtected: boolean;
  isEncrypted: boolean;
  isCreator: boolean;
  onSettingsUpdate?: (updates: {
    password?: string | null;
    permissions?: "view" | "edit";
    expiry?: string | null;
  }) => Promise<void>;
  onDeleteRoom?: () => Promise<void>;
}

export function RoomSettings({ 
  room, 
  isPasswordProtected, 
  isEncrypted, 
  isCreator,
  onSettingsUpdate,
  onDeleteRoom 
}: RoomSettingsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [permissions, setPermissions] = useState<"view" | "edit">(room?.permissions || "edit");
  const [expiry, setExpiry] = useState<string>("never");
  const [isSaving, setIsSaving] = useState(false);

  // Calculate current expiry display - returns preset string or ISO date string
  const getExpiryDisplay = () => {
    if (!room?.expires_at) return "never";
    const expiresAt = new Date(room.expires_at);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffMs < 0) return room.expires_at; // Return ISO string for expired custom dates
    if (diffHours < 1) return "1h";
    if (diffHours < 24) return "24h";
    if (diffDays < 7) return "7d";
    if (diffDays < 30) return "30d";
    // For dates > 30 days, return the ISO string (custom date)
    return room.expires_at;
  };

  useEffect(() => {
    if (room) {
      setPermissions(room.permissions || "edit");
      const expiryValue = getExpiryDisplay();
      setExpiry(expiryValue);
    }
  }, [room]);

  const handleSave = async () => {
    if (!onSettingsUpdate) return;

    // Validate password if setting one
    if (newPassword.trim() && newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (newPassword.trim() && newPassword.length < 3) {
      toast.error("Password must be at least 3 characters");
      return;
    }

    setIsSaving(true);
    try {
      const updates: {
        password?: string | null;
        permissions?: "view" | "edit";
        expiry?: string | null;
      } = {};

      // Handle password changes
      if (newPassword.trim()) {
        updates.password = newPassword.trim();
      } else if (isPasswordProtected && !newPassword.trim()) {
        // Removing password
        updates.password = null;
      }

      // Only update if changed
      if (permissions !== room?.permissions) {
        updates.permissions = permissions;
      }

      // Handle expiry
      const currentExpiryDisplay = getExpiryDisplay();
      if (expiry !== currentExpiryDisplay) {
        if (expiry === "never") {
          updates.expiry = null;
        } else if (expiry === "1h" || expiry === "24h" || expiry === "7d" || expiry === "30d") {
          // Handle preset expiry
          const now = new Date();
          switch (expiry) {
            case "1h":
              now.setHours(now.getHours() + 1);
              break;
            case "24h":
              now.setHours(now.getHours() + 24);
              break;
            case "7d":
              now.setDate(now.getDate() + 7);
              break;
            case "30d":
              now.setDate(now.getDate() + 30);
              break;
          }
          updates.expiry = now.toISOString();
        } else {
          // Custom date is already an ISO string
          updates.expiry = expiry;
        }
      }

      await onSettingsUpdate(updates);
      
      // Note: Password removal automatically decrypts all existing content
      // Password change automatically re-encrypts all existing content
      // No warnings needed as this is handled automatically

      setIsEditing(false);
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Settings updated!");
    } catch (error) {
      console.error("Error updating settings:", error);
      toast.error("Failed to update settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setNewPassword("");
    setConfirmPassword("");
    setPermissions(room?.permissions || "edit");
    setExpiry(getExpiryDisplay());
  };

  return (
    <Card className="glass-card p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Settings className="w-4 h-4 text-muted-foreground" />
          <div className="flex flex-wrap gap-2">
            {room?.permissions === "edit" ? (
              <Badge variant="default" className="gap-1">
                <Edit className="w-3 h-3" />
                Edit Mode
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <Eye className="w-3 h-3" />
                View Only
              </Badge>
            )}
            
            {isPasswordProtected && (
              <Badge variant="default" className="gap-1">
                <Shield className="w-3 h-3" />
                Password Protected
              </Badge>
            )}
            
            {isEncrypted && (
              <Badge variant="default" className="gap-1 bg-green-500/10 text-green-500 border-green-500/20">
                <Key className="w-3 h-3" />
                End-to-End Encrypted
              </Badge>
            )}
          </div>
        </div>
        
        {isCreator && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className="gap-2"
          >
            {isEditing ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Hide Settings
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Edit Settings
              </>
            )}
          </Button>
        )}
      </div>

      {isEditing && isCreator && (
        <div className="mt-4 pt-4 border-t border-border space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              {isPasswordProtected ? "Change Password" : "Set Password"}
            </Label>
            <Input
              id="password"
              type="password"
              placeholder={isPasswordProtected ? "Leave empty to remove password" : "Enter new password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-background/50"
              maxLength={100}
            />
            {newPassword.trim() && (
              <Input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-background/50"
                maxLength={100}
              />
            )}
            <p className="text-xs text-muted-foreground">
              {isPasswordProtected 
                ? "Leave empty to remove password. All existing encrypted content will be automatically decrypted."
                : "Password enables end-to-end encryption for your room"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="permissions" className="flex items-center gap-2">
              {permissions === "edit" ? <Edit className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              Room Permissions
            </Label>
            <Select value={permissions} onValueChange={(v) => setPermissions(v as "view" | "edit")}>
              <SelectTrigger id="permissions" className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    <span>View Only - Others can only see content</span>
                  </div>
                </SelectItem>
                <SelectItem value="edit">
                  <div className="flex items-center gap-2">
                    <Edit className="w-4 h-4" />
                    <span>Edit - Others can add and delete content</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <CustomExpiryPicker
            value={expiry}
            onChange={setExpiry}
            label="Room Expiry"
          />

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 gradient-warm"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              disabled={isSaving}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>

          {/* Delete Room Section */}
          {isCreator && onDeleteRoom && (
            <div className="mt-6 pt-6 border-t border-destructive/20">
              <Label className="text-destructive mb-2 block">Danger Zone</Label>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full gap-2"
                    disabled={isSaving}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Room Permanently
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Room?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the room
                      and all shared content (text, files, code snippets, and links). All data will be lost.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDeleteRoom}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete Room
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
