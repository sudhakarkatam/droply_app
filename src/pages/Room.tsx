import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Upload, Link2, FileText, Clock, Copy, CheckCircle2, Trash2, Lock, Code, File, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ShareDisplay } from "@/components/ShareDisplay";
import { FileUpload } from "@/components/FileUpload";
import { PasswordDialog } from "@/components/PasswordDialog";
import { CodeSnippetUpload } from "@/components/CodeSnippetUpload";
import { RoomSettings } from "@/components/RoomSettings";
import { encrypt, decrypt, hashPassword, generateKey, verifyEncryption, isEncrypted } from "@/lib/crypto";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function Room() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [room, setRoom] = useState<any>(null);
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [isPasswordKey, setIsPasswordKey] = useState(false);
  const [oldEncryptionKeys, setOldEncryptionKeys] = useState<string[]>([]); // Store old passwords for decrypting old content
  const [isCreator, setIsCreator] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [shareContentTab, setShareContentTab] = useState<string>("text");
  const [decryptedShares, setDecryptedShares] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [decryptedContentMap, setDecryptedContentMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!id) {
      navigate("/");
      return;
    }

    // Extract encryption key from URL fragment (for non-password rooms)
    const fragment = location.hash.substring(1);
    if (fragment) {
      setEncryptionKey(fragment);
      sessionStorage.setItem(`room_key_${id}`, fragment);
    } else {
      // Try to load from sessionStorage (not localStorage)
      const storedKey = sessionStorage.getItem(`room_key_${id}`);
      if (storedKey) {
        setEncryptionKey(storedKey);
      }
    }

    loadRoom();
    subscribeToShares();
  }, [id]);

  // Clear password only when navigating away from the room (not on refresh)
  // sessionStorage naturally persists on refresh and clears on tab close
  useEffect(() => {
    // Only clear if pathname changes and we're no longer on this room's route
    if (id && !location.pathname.startsWith(`/room/${id}`)) {
      // User navigated away from this room - clear password
      sessionStorage.removeItem(`room_password_${id}`);
    }
  }, [location.pathname, id]);

  const loadRoom = async (skipPasswordCheck = false) => {
    try {
      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (roomError) {
        throw roomError;
      }

      if (!roomData) {
        // Room doesn't exist
        toast.error("Room not found");
        navigate("/");
        return;
      }

      setRoom(roomData);

      // Check if room is expired
      if (roomData.expires_at && new Date(roomData.expires_at) < new Date()) {
        toast.error("This room has expired");
        navigate("/");
        return;
      }

      // Check if user is creator (by creator_token)
      const storedCreatorToken = localStorage.getItem(`room_creator_${id}`);
      const isOriginalCreator = storedCreatorToken === roomData.creator_token;

      // Check password protection - always ask for password when entering room
      // SessionStorage is cleared on navigation away, so new visits always require password
      // Only skip if already verified in current component session (skipPasswordCheck = true)
      if (roomData.password && !skipPasswordCheck) {
        // Check sessionStorage for same-tab refresh scenario only
        // If navigating away and back, sessionStorage was cleared by cleanup
        const sessionPassword = sessionStorage.getItem(`room_password_${id}`);
        if (sessionPassword) {
          // Same session refresh - verify the stored password
          const trimmedPassword = sessionPassword.trim();
          const passwordHash = await hashPassword(trimmedPassword);
          if (passwordHash === roomData.password) {
            setIsPasswordVerified(true);
            setEncryptionKey(trimmedPassword);
            setIsPasswordKey(true);
            // For password-protected rooms: anyone with the password gets admin access
            setIsCreator(true);
            // Check if there's an old password stored for decrypting old content
            const oldPassword = sessionStorage.getItem(`room_password_old_${id}`);
            if (oldPassword) {
              setOldEncryptionKeys(prev => {
                if (!prev.includes(oldPassword)) {
                  return [...prev, oldPassword];
                }
                return prev;
              });
            }
          } else {
            // Invalid password, clear it and ask again
            sessionStorage.removeItem(`room_password_${id}`);
            setShowPasswordDialog(true);
            setLoading(false);
            return;
          }
        } else {
          // New visit or navigated away - always ask for password
          setShowPasswordDialog(true);
          setLoading(false);
          return;
        }
      } else {
        setIsPasswordVerified(true);
        
        // Determine creator status:
        // - For password-protected rooms: if password was verified (skipPasswordCheck = true), grant admin access
        // - For non-password rooms: only original creator is admin
        if (roomData.password && skipPasswordCheck) {
          // Password was already verified in this session - grant admin access
          // Ensure encryptionKey is set from sessionStorage if not already set
          const sessionPassword = sessionStorage.getItem(`room_password_${id}`);
          if (sessionPassword && !encryptionKey) {
            setEncryptionKey(sessionPassword.trim());
            setIsPasswordKey(true);
          }
          // Also load old passwords if any
          const oldPassword = sessionStorage.getItem(`room_password_old_${id}`);
          if (oldPassword) {
            setOldEncryptionKeys(prev => {
              if (!prev.includes(oldPassword)) {
                return [...prev, oldPassword];
              }
              return prev;
            });
          }
          setIsCreator(true);
        } else {
          // Non-password room - only original creator is admin
          setIsCreator(isOriginalCreator);
        }
      }

      // Load shares
      const { data: sharesData } = await supabase
        .from("shares")
        .select("*")
        .eq("room_id", id)
        .order("created_at", { ascending: false });

      setShares(sharesData || []);
    } catch (error) {
      console.error("Error loading room:", error);
      toast.error("Failed to load room");
    } finally {
      setLoading(false);
    }
  };

  // Decrypt shares and store decrypted content for searching
  useEffect(() => {
    const decryptShares = async () => {
      const decrypted = await Promise.all(
        shares.map(async (share) => {
          const shareCopy = { ...share };
          // File names and content will be decrypted by ShareDisplay component
          return shareCopy;
        })
      );
      setDecryptedShares(decrypted);

      // Decrypt all content for search purposes
      const contentMap = new Map<string, string>();
      for (const share of shares) {
        try {
          if (share.content && (share.type === "text" || share.type === "code" || share.type === "url")) {
            if (isEncrypted(share.content)) {
              // Try to decrypt
              if (encryptionKey) {
                try {
                  const decrypted = await decrypt(share.content, encryptionKey, isPasswordKey);
                  if (!isEncrypted(decrypted)) {
                    contentMap.set(share.id, decrypted);
                  } else {
                    // Decryption failed or result still encrypted, use original
                    contentMap.set(share.id, share.content);
                  }
                } catch {
                  // Decryption failed, use original for search (won't match encrypted content)
                  contentMap.set(share.id, share.content);
                }
              } else {
                // No key available, can't decrypt - won't be searchable
                contentMap.set(share.id, "");
              }
            } else {
              // Not encrypted, use as-is
              contentMap.set(share.id, share.content);
            }
          }
        } catch (error) {
          console.error("Error decrypting content for search:", share.id, error);
          contentMap.set(share.id, share.content || "");
        }
      }
      setDecryptedContentMap(contentMap);
    };

    if (shares.length > 0) {
      decryptShares();
    } else {
      setDecryptedShares([]);
      setDecryptedContentMap(new Map());
    }
  }, [shares, encryptionKey, isPasswordKey]);

  // Calculate counts for each tab
  const shareCounts = useMemo(() => {
    const files = decryptedShares.filter(s => s.type === "file").length;
    const links = decryptedShares.filter(s => s.type === "url").length;
    const code = decryptedShares.filter(s => s.type === "code").length;
    const text = decryptedShares.filter(s => s.type === "text").length;
    
    return {
      all: decryptedShares.length,
      files,
      code,
      links,
      text,
    };
  }, [decryptedShares]);

  const handlePasswordSubmit = async (password: string) => {
    if (!room?.password) {
      toast.error("This room has no password");
      return;
    }

    // Trim password to match how it was stored during creation
    const trimmedPassword = password.trim();

    // Hash the input password and compare with stored hash
    const passwordHash = await hashPassword(trimmedPassword);
    if (passwordHash === room.password) {
      // Store password in sessionStorage (clears when tab closes) for current session only
      // Don't store in localStorage to force re-entry on new visits
      sessionStorage.setItem(`room_password_${id}`, trimmedPassword);
      setIsPasswordVerified(true);
      setEncryptionKey(trimmedPassword); // Use original password for encryption
      setIsPasswordKey(true);
      // For password-protected rooms: anyone with the password gets admin access
      setIsCreator(true);
      // Check if there's an old password stored for decrypting old content
      const oldPassword = sessionStorage.getItem(`room_password_old_${id}`);
      if (oldPassword) {
        setOldEncryptionKeys(prev => {
          if (!prev.includes(oldPassword)) {
            return [...prev, oldPassword];
          }
          return prev;
        });
      }
      setShowPasswordDialog(false);
      loadRoom(true);
      toast.success("Access granted!");
    } else {
      toast.error("Incorrect password");
    }
  };

  const handlePasswordCancel = () => {
    navigate("/");
  };

  const subscribeToShares = () => {
    const channel = supabase
      .channel(`room-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shares",
          filter: `room_id=eq.${id}`,
        },
        () => {
          loadRoom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleShareText = async () => {
    if (!text.trim()) return;

    if (room?.permissions === "view") {
      toast.error("This room is view-only");
      return;
    }

    // Validate encryption for password-protected rooms
    if (room?.password && !encryptionKey) {
      toast.error("Password required to encrypt content");
      setShowPasswordDialog(true);
      return;
    }

    try {
      const encryptedText = await encrypt(text, encryptionKey, isPasswordKey);

      // Verify encryption succeeded for password-protected rooms
      if (room?.password) {
        if (!verifyEncryption(encryptedText, text)) {
          toast.error("Encryption failed. Content cannot be saved unencrypted.");
          console.error("Encryption verification failed:", { 
            original: text.substring(0, 20), 
            encrypted: encryptedText.substring(0, 50) 
          });
          return;
        }
      }

      const { error } = await supabase.from("shares").insert({
        room_id: id,
        type: "text",
        content: encryptedText,
      });

      if (error) {
        toast.error("Failed to share text");
      } else {
        toast.success("Text shared!");
        setText("");
      }
    } catch (error) {
      console.error("Encryption error:", error);
      toast.error("Failed to encrypt content");
    }
  };

  const handleShareUrl = async () => {
    if (!url.trim()) return;

    if (room?.permissions === "view") {
      toast.error("This room is view-only");
      return;
    }

    // Validate encryption for password-protected rooms
    if (room?.password && !encryptionKey) {
      toast.error("Password required to encrypt content");
      setShowPasswordDialog(true);
      return;
    }

    try {
      // Normalize URL - add protocol if missing
      let normalizedUrl = url.trim();
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }

      const encryptedUrl = await encrypt(normalizedUrl, encryptionKey, isPasswordKey);

      // Verify encryption succeeded for password-protected rooms
      if (room?.password) {
        if (!verifyEncryption(encryptedUrl, normalizedUrl)) {
          toast.error("Encryption failed. Content cannot be saved unencrypted.");
          console.error("Encryption verification failed");
          return;
        }
      }

      const { error } = await supabase.from("shares").insert({
        room_id: id,
        type: "url",
        content: encryptedUrl,
      });

      if (error) {
        toast.error("Failed to share URL");
      } else {
        toast.success("URL shared!");
        setUrl("");
      }
    } catch (error) {
      console.error("Encryption error:", error);
      toast.error("Failed to encrypt content");
    }
  };

  const handleShareCode = async (code: string, language: string) => {
    if (room?.permissions === "view") {
      toast.error("This room is view-only");
      return;
    }

    // Validate encryption for password-protected rooms
    if (room?.password && !encryptionKey) {
      toast.error("Password required to encrypt content");
      setShowPasswordDialog(true);
      return;
    }

    try {
      const encryptedCode = await encrypt(code, encryptionKey, isPasswordKey);

      // Verify encryption succeeded for password-protected rooms
      if (room?.password) {
        if (!verifyEncryption(encryptedCode, code)) {
          toast.error("Encryption failed. Content cannot be saved unencrypted.");
          console.error("Encryption verification failed");
          return;
        }
      }

      const { error } = await supabase.from("shares").insert({
        room_id: id,
        type: "code",
        content: encryptedCode,
      });

      if (error) {
        toast.error("Failed to share code");
      } else {
        toast.success("Code snippet shared!");
      }
    } catch (error) {
      console.error("Encryption error:", error);
      toast.error("Failed to encrypt content");
    }
  };

  const copyRoomLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteShare = async (shareId: string) => {
    if (room?.permissions === "view") {
      toast.error("This room is view-only");
      return;
    }

    const { error } = await supabase.from("shares").delete().eq("id", shareId);

    if (error) {
      toast.error("Failed to delete share");
    } else {
      toast.success("Share deleted");
      // Reload room to update shares list (triggers FileUpload refreshTrigger)
      await loadRoom();
    }
  };

  const updateRoomSettings = async (updates: {
    password?: string | null;
    permissions?: "view" | "edit";
    expiry?: string | null;
  }) => {
    // For password-protected rooms: anyone with password can modify settings
    // For non-password rooms: check if creator token exists
    if (room?.password) {
      // Password-protected room: verify we have the password
      if (!encryptionKey) {
        toast.error("Password required to update settings");
        setShowPasswordDialog(true);
        return;
      }
    } else {
      // Non-password room: check creator token if room has one
      const creatorToken = localStorage.getItem(`room_creator_${id}`);
      if (room?.creator_token && (!creatorToken || creatorToken !== room.creator_token)) {
        toast.error("Only room creator can modify settings");
        return;
      }
    }

    // Prepare parameters for RPC call
    const rpcParams: any = {
      p_room_id: id,
    };

    // For password-protected rooms, send current password hash for verification
    if (room?.password) {
      const currentPassword = sessionStorage.getItem(`room_password_${id}`);
      if (!currentPassword) {
        toast.error("Password required to update settings");
        return;
      }
      rpcParams.p_current_password_hash = await hashPassword(currentPassword.trim());
    } else {
      // For non-password rooms, send creator_token if available
      const creatorToken = localStorage.getItem(`room_creator_${id}`);
      if (creatorToken) {
        rpcParams.p_creator_token = creatorToken;
      }
    }

    // Handle password changes
    if (updates.password !== undefined) {
      rpcParams.p_update_password = true;
      if (updates.password === null) {
        // Removing password - decrypt all existing encrypted content before removing password
        // Get current password before it's removed (needed to decrypt existing content)
        const currentPassword = sessionStorage.getItem(`room_password_${id}`);
        const wasPasswordProtected = !!room?.password;
        
        if (wasPasswordProtected && currentPassword) {
          try {
            // Fetch all shares in the room
            const { data: allShares, error: sharesError } = await supabase
              .from("shares")
              .select("*")
              .eq("room_id", id);

            if (sharesError) {
              console.error("Error fetching shares for decryption:", sharesError);
              toast.error("Failed to fetch shares for decryption");
              throw sharesError;
            }

            if (allShares && allShares.length > 0) {
              // Decrypt each share and save as unencrypted
              const decryptionPromises = allShares.map(async (share) => {
                try {
                  const updateData: any = {};
                  
                  // Handle content (text, code, URLs)
                  if (share.content && isEncrypted(share.content)) {
                    try {
                      // Decrypt content with current password
                      const decryptedContent = await decrypt(share.content, currentPassword.trim(), true);
                      // Verify decryption succeeded (result should not be encrypted)
                      if (!isEncrypted(decryptedContent)) {
                        updateData.content = decryptedContent;
                      } else {
                        console.error("Decryption failed for share content - result still encrypted", share.id);
                        // Try to continue with other shares
                        return null;
                      }
                    } catch (decryptError) {
                      console.error("Error decrypting share content:", share.id, decryptError);
                      // If decryption fails, we can't convert to unencrypted - skip this share
                      return null;
                    }
                  } else if (share.content) {
                    // Content is already unencrypted, no need to update
                  }

                  // Handle file names
                  if (share.type === "file" && share.file_name && isEncrypted(share.file_name)) {
                    try {
                      // Decrypt file name with current password
                      const decryptedFileName = await decrypt(share.file_name, currentPassword.trim(), true);
                      if (!isEncrypted(decryptedFileName)) {
                        updateData.file_name = decryptedFileName;
                      } else {
                        console.error("Decryption failed for share file name - result still encrypted", share.id);
                        // Continue even if file name decryption fails
                      }
                    } catch (decryptError) {
                      console.error("Error decrypting share file name:", share.id, decryptError);
                      // Continue even if file name decryption fails
                    }
                  } else if (share.type === "file" && share.file_name) {
                    // File name is already unencrypted, no need to update
                  }

                  // Only update if we have decrypted content to save
                  if (Object.keys(updateData).length > 0) {
                    const { error: updateError } = await supabase
                      .from("shares")
                      .update(updateData)
                      .eq("id", share.id);

                    if (updateError) {
                      console.error("Error updating share during decryption:", updateError, share.id);
                      return null;
                    }

                    return share.id;
                  }
                  
                  // Share had no encrypted content to decrypt, or all decryption succeeded but no updates needed
                  return share.id; // Count as success even if no update needed
                } catch (error) {
                  console.error("Unexpected error decrypting share:", share.id, error);
                  return null;
                }
              });

              // Wait for all decryptions to complete
              const results = await Promise.all(decryptionPromises);
              const successCount = results.filter(r => r !== null).length;
              const totalCount = allShares.length;
              
              if (successCount > 0) {
                toast.success(`Decrypted ${successCount} of ${totalCount} item(s) - password removed`);
              } else if (totalCount > 0) {
                toast.warning("Failed to decrypt some existing content. Please verify password was correct.");
              }
            }
          } catch (error) {
            console.error("Error during content decryption:", error);
            toast.error("Failed to decrypt existing content before removing password");
            // Don't proceed with password removal if decryption fails
            throw error;
          }
        }
        
        // Now remove password - pass null explicitly
        rpcParams.p_password = null;
        
        // For public rooms, encryption key should come from URL fragment if available
        // Otherwise, content will be stored unencrypted (encryptionKey = null)
        const fragment = location.hash.substring(1);
        if (fragment) {
          // URL has encryption key - use it for future content
          sessionStorage.setItem(`room_key_${id}`, fragment);
          setEncryptionKey(fragment);
          setIsPasswordKey(false);
        } else {
          // No URL fragment - truly public room, no encryption for future content
          const storedKey = sessionStorage.getItem(`room_key_${id}`);
          if (storedKey) {
            setEncryptionKey(storedKey);
            setIsPasswordKey(false);
          } else {
            // No key at all - future content will be unencrypted
            setEncryptionKey(null);
            setIsPasswordKey(false);
          }
        }
        
        sessionStorage.removeItem(`room_password_${id}`);
        localStorage.removeItem(`room_password_${id}`);
        // Clear old encryption keys since password is removed
        setOldEncryptionKeys([]);
        sessionStorage.removeItem(`room_password_old_${id}`);
      } else {
        // Setting or changing password
        const trimmedPassword = updates.password.trim();
        const newPasswordHash = await hashPassword(trimmedPassword);
        rpcParams.p_password = newPasswordHash;
        
        // Get old password before changing (if any)
        const oldPassword = sessionStorage.getItem(`room_password_${id}`);
        const wasPasswordProtected = !!room?.password;
        
        // If password is being changed or added (even to public room), re-encrypt all existing content
        // This ensures all content uses the latest password
        // Note: oldPassword might be null if adding password to public room - that's OK, we'll encrypt unencrypted content
        if (oldPassword !== trimmedPassword) {
          try {
            // Fetch all shares in the room
            const { data: allShares, error: sharesError } = await supabase
              .from("shares")
              .select("*")
              .eq("room_id", id);

            if (sharesError) {
              console.error("Error fetching shares for re-encryption:", sharesError);
              toast.error("Failed to fetch shares for re-encryption");
              throw sharesError;
            }

            if (allShares && allShares.length > 0) {
              // Re-encrypt each share with the new password
              const reEncryptionPromises = allShares.map(async (share) => {
                try {
                  // Get decrypted content
                  let decryptedContent: string | null = null;
                  let decryptedFileName: string | null = null;

                  // Handle content (text, code, URLs)
                  if (share.content) {
                    if (wasPasswordProtected && isEncrypted(share.content)) {
                      // Content was encrypted with old password - decrypt it
                      if (oldPassword) {
                        decryptedContent = await decrypt(share.content, oldPassword, true);
                      } else {
                        // This shouldn't happen, but skip if no old password
                        return null;
                      }
                    } else {
                      // Content was never encrypted (from public room) - use as-is
                      decryptedContent = share.content;
                    }
                  }

                  // Handle file names
                  if (share.type === "file" && share.file_name) {
                    if (wasPasswordProtected && isEncrypted(share.file_name)) {
                      // File name was encrypted with old password - decrypt it
                      if (oldPassword) {
                        decryptedFileName = await decrypt(share.file_name, oldPassword, true);
                      } else {
                        // Fallback to original if decryption fails
                        decryptedFileName = share.file_name;
                      }
                    } else {
                      // File name was never encrypted - use as-is
                      decryptedFileName = share.file_name;
                    }
                  }

                  // Skip if no content to encrypt
                  if (!decryptedContent && !decryptedFileName) {
                    return null;
                  }

                  // Encrypt with new password
                  const updateData: any = {};
                  
                  if (decryptedContent) {
                    const reEncryptedContent = await encrypt(decryptedContent, trimmedPassword, true);
                    // Verify encryption succeeded
                    if (!verifyEncryption(reEncryptedContent, decryptedContent)) {
                      console.error("Re-encryption verification failed for share content", share.id);
                      return null;
                    }
                    updateData.content = reEncryptedContent;
                  }

                  if (decryptedFileName) {
                    const reEncryptedFileName = await encrypt(decryptedFileName, trimmedPassword, true);
                    if (!verifyEncryption(reEncryptedFileName, decryptedFileName)) {
                      console.error("Re-encryption verification failed for share file name", share.id);
                      // Don't fail entire operation, just skip file name update
                    } else {
                      updateData.file_name = reEncryptedFileName;
                    }
                  }

                  // Update share in database
                  const { error: updateError } = await supabase
                    .from("shares")
                    .update(updateData)
                    .eq("id", share.id);

                  if (updateError) {
                    console.error("Error updating share during re-encryption:", updateError, share.id);
                    return null;
                  }

                  return share.id;
                } catch (error) {
                  console.error("Error re-encrypting share:", share.id, error);
                  return null;
                }
              });

              // Wait for all re-encryptions to complete
              const results = await Promise.all(reEncryptionPromises);
              const successCount = results.filter(r => r !== null).length;
              const totalCount = allShares.length;
              
              if (successCount > 0) {
                toast.success(`Re-encrypted ${successCount} of ${totalCount} item(s) with new password`);
              } else if (totalCount > 0) {
                toast.warning("Failed to re-encrypt existing content. Please try again.");
              }
            }
          } catch (error) {
            console.error("Error during content re-encryption:", error);
            toast.error("Failed to re-encrypt existing content");
            // Continue with password update even if re-encryption fails
          }
        }
        
        // Store new password
        sessionStorage.setItem(`room_password_${id}`, trimmedPassword);
        localStorage.setItem(`room_password_${id}`, trimmedPassword);
        setEncryptionKey(trimmedPassword);
        setIsPasswordKey(true);
        // Clear old encryption keys since everything is now encrypted with new password
        setOldEncryptionKeys([]);
        sessionStorage.removeItem(`room_password_old_${id}`);
      }
    }

    // Handle permissions
    if (updates.permissions !== undefined) {
      rpcParams.p_update_permissions = true;
      rpcParams.p_permissions = updates.permissions;
    }

    // Handle expiry
    if (updates.expiry !== undefined) {
      rpcParams.p_update_expires_at = true;
      rpcParams.p_expires_at = updates.expiry;
    }

    // Call secure RPC function instead of direct update
    const { data, error } = await supabase.rpc('update_room_settings', rpcParams);

    if (error) {
      console.error("Error updating room settings:", error);
      toast.error(error.message || "Failed to update room settings");
      throw error;
    }

    // Check if function returned success
    if (data && !data.success) {
      toast.error(data.error || "Failed to update room settings");
      throw new Error(data.error || "Update failed");
    }

    // Reload room data after password change to ensure everything is updated
    await loadRoom(true);
    
    // Reload shares to show re-encrypted content
    const { data: updatedShares } = await supabase
      .from("shares")
      .select("*")
      .eq("room_id", id)
      .order("created_at", { ascending: false });

    if (updatedShares) {
      setShares(updatedShares);
    }
  };

  const deleteRoom = async () => {
    // For password-protected rooms: anyone with password can delete
    // For non-password rooms: check if creator token exists
    if (room?.password) {
      // Password-protected room: verify we have the password
      if (!encryptionKey) {
        toast.error("Password required to delete room");
        setShowPasswordDialog(true);
        return;
      }
    } else {
      // Non-password room: check creator token if room has one
      const creatorToken = localStorage.getItem(`room_creator_${id}`);
      if (room?.creator_token && (!creatorToken || creatorToken !== room.creator_token)) {
        toast.error("Only room creator can delete the room");
        return;
      }
    }

    try {
      // Prepare RPC parameters
      const rpcParams: any = {
        p_room_id: id,
      };

      // For password-protected rooms, send current password hash for verification
      if (room?.password) {
        const currentPassword = sessionStorage.getItem(`room_password_${id}`);
        if (!currentPassword) {
          toast.error("Password required to delete room");
          return;
        }
        rpcParams.p_current_password_hash = await hashPassword(currentPassword.trim());
      } else {
        // For non-password rooms, send creator_token if available
        const creatorToken = localStorage.getItem(`room_creator_${id}`);
        if (creatorToken) {
          rpcParams.p_creator_token = creatorToken;
        }
      }

      const { data, error } = await supabase.rpc('delete_room', rpcParams);

      if (error) {
        console.error("Error deleting room:", error);
        toast.error(error.message || "Failed to delete room");
        return;
      }

      // Check if function returned success
      if (data && !data.success) {
        toast.error(data.error || "Failed to delete room");
        return;
      }

      toast.success("Room deleted successfully");
      
      // Clean up local storage
      localStorage.removeItem(`room_creator_${id}`);
      localStorage.removeItem(`room_password_${id}`);
      localStorage.removeItem(`room_key_${id}`);
      sessionStorage.removeItem(`room_password_${id}`);
      sessionStorage.removeItem(`room_key_${id}`);

      // Navigate to home
      navigate("/");
    } catch (error) {
      console.error("Error deleting room:", error);
      toast.error("Failed to delete room");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xl text-muted-foreground"
        >
          Loading room...
        </motion.div>
      </div>
    );
  }

  if (!isPasswordVerified) {
    return (
      <PasswordDialog
        open={showPasswordDialog}
        onPasswordSubmit={handlePasswordSubmit}
        onCancel={handlePasswordCancel}
      />
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <h1 className="text-4xl font-bold text-gradient">Droply</h1>
          <p className="text-muted-foreground">Share anything, instantly</p>

          <Card className="glass-card p-4 flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              {room?.expires_at ? (
                <span>Expires {formatDistanceToNow(new Date(room.expires_at), { addSuffix: true })}</span>
              ) : (
                <span>Never expires</span>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Split View Layout - Larger content area */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Side: Share Content with Tabs + Settings */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 space-y-4"
          >
            {/* Actions: Copy Link and Edit Settings */}
            <div className="flex gap-2 flex-wrap">
              <Button onClick={copyRoomLink} variant="outline" size="sm" className="gap-2 flex-1 sm:flex-initial">
                {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
              <div className="flex-1 sm:flex-initial">
                <RoomSettings 
                  room={room} 
                  isPasswordProtected={!!room?.password}
                  isEncrypted={!!encryptionKey}
                  isCreator={isCreator}
                  onSettingsUpdate={updateRoomSettings}
                  onDeleteRoom={deleteRoom}
                />
              </div>
            </div>

            <h2 className="text-xl font-bold mb-4">Share Content</h2>
            
            {/* Share Content Tabs */}
            <Card className="glass-card p-6">
              <Tabs value={shareContentTab} onValueChange={setShareContentTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4 bg-background/50 mb-4">
                  <TabsTrigger value="text" className="gap-2">
                    <FileText className="w-4 h-4" />
                    <span className="hidden sm:inline">Text</span>
                  </TabsTrigger>
                  <TabsTrigger value="file" className="gap-2">
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">File</span>
                  </TabsTrigger>
                  <TabsTrigger value="code" className="gap-2">
                    <Code className="w-4 h-4" />
                    <span className="hidden sm:inline">Code</span>
                  </TabsTrigger>
                  <TabsTrigger value="link" className="gap-2">
                    <Link2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Link</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="text" className="space-y-4">
                  <div>
                    <Label className="mb-2 block">Share Text</Label>
                    <Textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Paste your text here..."
                      className="min-h-32 bg-background/50"
                    />
                  </div>
                  <Button onClick={handleShareText} className="w-full gradient-warm" disabled={room?.permissions === "view"}>
                    Share Text
                  </Button>
                </TabsContent>

                <TabsContent value="file" className="space-y-4">
                  <div>
                    <Label className="mb-2 block">Upload File</Label>
                    <FileUpload 
                      roomId={id!} 
                      onUploadComplete={loadRoom}
                      encryptionKey={encryptionKey}
                      isPasswordKey={isPasswordKey}
                      disabled={room?.permissions === "view"}
                      refreshTrigger={shares.length} // Trigger refetch when shares change (including deletions)
                    />
                  </div>
                </TabsContent>

                <TabsContent value="code" className="space-y-4">
                  <div>
                    <Label className="mb-2 block">Share Code Snippet</Label>
                    <CodeSnippetUpload 
                      onShare={handleShareCode}
                      disabled={room?.permissions === "view"}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="link" className="space-y-4">
                  <div>
                    <Label className="mb-2 block">Share URL</Label>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="bg-background/50"
                    />
                  </div>
                  <Button onClick={handleShareUrl} className="w-full gradient-warm" disabled={room?.permissions === "view"}>
                    Share URL
                  </Button>
                </TabsContent>
              </Tabs>
            </Card>
          </motion.div>

          {/* Right Side: Content Display with Tabs - Larger area */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-3 space-y-4"
          >
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-xl font-bold">Content</h2>
              {/* Search Input */}
              <div className="relative w-full sm:w-auto sm:min-w-[250px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search text, code, links..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 bg-background/50"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-transparent"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            
            {decryptedShares.length > 0 ? (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5 bg-background/50">
                  <TabsTrigger value="all" className="gap-1 text-xs sm:text-sm">
                    All
                    {shareCounts.all > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                        {shareCounts.all}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="files" className="gap-1 text-xs sm:text-sm">
                    <File className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Files</span>
                    {shareCounts.files > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                        {shareCounts.files}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="code" className="gap-1 text-xs sm:text-sm">
                    <Code className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Code</span>
                    {shareCounts.code > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                        {shareCounts.code}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="links" className="gap-1 text-xs sm:text-sm">
                    <Link2 className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Links</span>
                    {shareCounts.links > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                        {shareCounts.links}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="text" className="gap-1 text-xs sm:text-sm">
                    <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Text</span>
                    {shareCounts.text > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                        {shareCounts.text}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="mt-4">
                  {(() => {
                    const filteredShares = shares.filter((share) => {
                      // Filter by tab type
                      if (activeTab === "files") {
                        if (share.type !== "file") return false;
                      } else if (activeTab === "links") {
                        if (share.type !== "url") return false;
                      } else if (activeTab === "code") {
                        if (share.type !== "code") return false;
                      } else if (activeTab === "text") {
                        if (share.type !== "text") return false;
                      }

                      // Filter by search query (only for text, code, and links)
                      if (searchQuery.trim()) {
                        const query = searchQuery.trim().toLowerCase();
                        // Only search in text, code, and link content
                        if (share.type === "text" || share.type === "code" || share.type === "url") {
                          const decryptedContent = decryptedContentMap.get(share.id) || "";
                          return decryptedContent.toLowerCase().includes(query);
                        }
                        // For files, don't filter by search (can add file name search later)
                        if (share.type === "file") {
                          return true; // Keep files when searching
                        }
                        return false;
                      }
                      
                      return true;
                    });

                    if (filteredShares.length === 0) {
                      return (
                        <Card className="glass-card p-12 text-center">
                          {searchQuery.trim() ? (
                            <p className="text-muted-foreground">
                              No content found matching "{searchQuery}"
                            </p>
                          ) : (
                            <p className="text-muted-foreground">No content in this category.</p>
                          )}
                        </Card>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        {filteredShares.map((share) => (
                        <Card key={share.id} className="glass-card p-6 relative group">
                          {room?.permissions === "edit" && (
                            <Button
                              onClick={() => deleteShare(share.id)}
                              variant="ghost"
                              size="sm"
                              className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                          <ShareDisplay 
                          share={share}
                          encryptionKey={encryptionKey}
                          isPasswordKey={isPasswordKey}
                          canDelete={room?.permissions === "edit"}
                          onDelete={() => deleteShare(share.id)}
                          oldEncryptionKeys={oldEncryptionKeys}
                          isPasswordProtected={!!room?.password}
                        />
                        </Card>
                      ))}
                      </div>
                    );
                  })()}
                </TabsContent>
              </Tabs>
            ) : (
              <Card className="glass-card p-12 text-center">
                <p className="text-muted-foreground">No content shared yet. Start sharing above!</p>
              </Card>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}