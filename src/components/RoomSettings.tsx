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
  isActualCreator?: boolean; // Whether user is the actual creator (has creator token)
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
  isActualCreator = isCreator, // Default to isCreator if not specified
  onSettingsUpdate,
  onDeleteRoom 
}: RoomSettingsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [permissions, setPermissions] = useState<"view" | "edit">(room?.permissions || "edit");
  const [expiry, setExpiry] = useState<string>("never");
  const [isSaving, setIsSaving] = useState(false);
  const [showRemovePassword, setShowRemovePassword] = useState(false);

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
      // Only include password in updates if:
      // 1. User entered a new password (to set or change), OR
      // 2. User explicitly clicked to remove password (for password-protected rooms)
      if (newPassword.trim()) {
        updates.password = newPassword.trim();
      } else if (isPasswordProtected && showRemovePassword) {
        // User explicitly chose to remove password
        updates.password = null;
      }
      // If neither condition is true, don't include password in updates

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
      setShowRemovePassword(false);
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
    setShowRemovePassword(false);
  };

  return (
    <Card className="glass-card p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-2 md:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 w-full sm:w-auto">
          <Settings className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            {room?.permissions === "edit" ? (
              <Badge variant="default" className="gap-1 text-[10px] xs:text-xs">
                <Edit className="w-2.5 h-2.5 xs:w-3 xs:h-3" />
                <span className="hidden xs:inline">Edit Mode</span>
                <span className="xs:hidden">Edit</span>
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 text-[10px] xs:text-xs">
                <Eye className="w-2.5 h-2.5 xs:w-3 xs:h-3" />
                <span className="hidden xs:inline">View Only</span>
                <span className="xs:hidden">View</span>
              </Badge>
            )}
            
            {isPasswordProtected && (
              <Badge variant="default" className="gap-1 text-[10px] xs:text-xs">
                <Shield className="w-2.5 h-2.5 xs:w-3 xs:h-3" />
                <span className="hidden sm:inline">Password Protected</span>
                <span className="sm:hidden">Protected</span>
              </Badge>
            )}
            
            {isEncrypted && (
              <Badge variant="default" className="gap-1 text-[10px] xs:text-xs bg-green-500/10 text-green-500 border-green-500/20">
                <Key className="w-2.5 h-2.5 xs:w-3 xs:h-3" />
                <span className="hidden sm:inline">Encrypted</span>
                <span className="sm:hidden">E2E</span>
              </Badge>
            )}
          </div>
        </div>
        
        {isCreator && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className="gap-1 sm:gap-2 text-xs sm:text-sm shrink-0 w-full sm:w-auto justify-center sm:justify-start"
          >
            {isEditing ? (
              <>
                <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Hide Settings</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Edit Settings</span>
              </>
            )}
          </Button>
        )}
      </div>

      {isEditing && isCreator && (
        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border space-y-3 sm:space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="flex items-center gap-2 text-sm sm:text-base">
              <Lock className="w-3 h-3 sm:w-4 sm:h-4" />
              {isPasswordProtected ? "Change Password" : "Set Password"}
            </Label>
            {isPasswordProtected && showRemovePassword ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                  ✓ Password will be removed. All existing encrypted content will be automatically decrypted.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowRemovePassword(false);
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                  className="w-full"
                >
                  Cancel - Keep Password
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter new password"
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
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {isPasswordProtected 
                    ? "Change password or remove password protection"
                    : "Password enables end-to-end encryption for your room"}
                </p>
                {isPasswordProtected && !showRemovePassword && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowRemovePassword(true)}
                    className="w-full"
                  >
                    Remove Password Protection
                  </Button>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="permissions" className="flex items-center gap-2 text-sm sm:text-base">
              {permissions === "edit" ? <Edit className="w-3 h-3 sm:w-4 sm:h-4" /> : <Eye className="w-3 h-3 sm:w-4 sm:h-4" />}
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

          <div className="flex gap-2 flex-col sm:flex-row">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 gradient-warm text-sm sm:text-base"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              disabled={isSaving}
              className="flex-1 text-sm sm:text-base"
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
