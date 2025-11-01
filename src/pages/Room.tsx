import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Upload, Link2, FileText, Clock, Copy, CheckCircle2, Trash2, Lock, Code, File, Eye, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ShareDisplay } from "@/components/ShareDisplay";
import { FileUpload } from "@/components/FileUpload";
import { PasswordDialog } from "@/components/PasswordDialog";
import { CodeSnippetUpload } from "@/components/CodeSnippetUpload";
import { RoomSettings } from "@/components/RoomSettings";
import { encrypt, hashPassword, generateKey, verifyEncryption } from "@/lib/crypto";

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
  const [isCreator, setIsCreator] = useState(false);
  const [hasEditPermission, setHasEditPermission] = useState(false);
  const [editToken, setEditToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [decryptedShares, setDecryptedShares] = useState<any[]>([]);

  useEffect(() => {
    if (!id) {
      navigate("/");
      return;
    }

    // Extract edit token from URL query parameter
    const searchParams = new URLSearchParams(location.search);
    const urlEditToken = searchParams.get("edit");
    if (urlEditToken) {
      setEditToken(urlEditToken);
      localStorage.setItem(`room_edit_${id}`, urlEditToken);
    } else {
      // Try to load from localStorage
      const storedEditToken = localStorage.getItem(`room_edit_${id}`);
      if (storedEditToken) {
        setEditToken(storedEditToken);
      }
    }

    // Extract encryption key from URL fragment
    const fragment = location.hash.substring(1);
    if (fragment) {
      setEncryptionKey(fragment);
      localStorage.setItem(`room_key_${id}`, fragment);
    } else {
      // Try to load from localStorage
      const storedKey = localStorage.getItem(`room_key_${id}`);
      if (storedKey) {
        setEncryptionKey(storedKey);
      }
    }

    loadRoom();
    subscribeToShares();
  }, [id, location.search, location.hash]);

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

      // Check if user is creator
      const storedCreatorToken = localStorage.getItem(`room_creator_${id}`);
      setIsCreator(storedCreatorToken === roomData.creator_token);

      // Check edit permission via edit_token
      // First check URL parameter, then localStorage, then state
      const searchParams = new URLSearchParams(location.search);
      const urlEditToken = searchParams.get("edit");
      const storedEditToken = localStorage.getItem(`room_edit_${id}`);
      const currentEditToken = urlEditToken || storedEditToken || editToken;
      
      if (currentEditToken && roomData.edit_token && currentEditToken === roomData.edit_token) {
        setHasEditPermission(true);
      } else if (roomData.permissions === "edit") {
        // Fallback: if room permissions allow editing, grant permission (backwards compatibility)
        setHasEditPermission(true);
      } else {
        setHasEditPermission(false);
      }

      // Check password protection
      if (roomData.password && !skipPasswordCheck) {
        // Check if password is stored in localStorage
        const storedPassword = localStorage.getItem(`room_password_${id}`);
        if (storedPassword) {
          // Trim stored password to match how it was stored during creation
          const trimmedPassword = storedPassword.trim();
          // Hash the stored password and compare with database hash
          const passwordHash = await hashPassword(trimmedPassword);
          if (passwordHash === roomData.password) {
            setIsPasswordVerified(true);
            setEncryptionKey(trimmedPassword); // Use original password for encryption
            setIsPasswordKey(true);
          } else {
            setShowPasswordDialog(true);
            setLoading(false);
            return;
          }
        } else {
          setShowPasswordDialog(true);
          setLoading(false);
          return;
        }
      } else {
        setIsPasswordVerified(true);
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

  // Decrypt shares when shares or encryption key changes
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
    };

    if (shares.length > 0) {
      decryptShares();
    } else {
      setDecryptedShares([]);
    }
  }, [shares, encryptionKey, isPasswordKey]);

  // Calculate counts for each tab (simplified - code/text distinction handled in ShareDisplay)
  const shareCounts = useMemo(() => {
    const files = decryptedShares.filter(s => s.type === "file").length;
    const links = decryptedShares.filter(s => s.type === "url").length;
    const textShares = decryptedShares.filter(s => s.type === "text").length;
    
    return {
      all: decryptedShares.length,
      files,
      code: textShares, // Will show all text shares in code tab initially
      links,
      text: textShares, // Will show all text shares in text tab initially
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
      localStorage.setItem(`room_password_${id}`, trimmedPassword);
      setIsPasswordVerified(true);
      setEncryptionKey(trimmedPassword); // Use original password for encryption
      setIsPasswordKey(true);
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

    if (!hasEditPermission && room?.permissions === "view") {
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

    if (!hasEditPermission && room?.permissions === "view") {
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
      const encryptedUrl = await encrypt(url, encryptionKey, isPasswordKey);

      // Verify encryption succeeded for password-protected rooms
      if (room?.password) {
        if (!verifyEncryption(encryptedUrl, url)) {
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
    if (!hasEditPermission && room?.permissions === "view") {
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
        type: "text",
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

  const copyViewLink = () => {
    const baseUrl = window.location.origin;
    const viewLink = `${baseUrl}/room/${id}`;
    navigator.clipboard.writeText(viewLink);
    toast.success("View link copied!");
  };

  const copyEditLink = () => {
    if (!room?.edit_token) {
      toast.error("Edit token not available");
      return;
    }
    const baseUrl = window.location.origin;
    const editLink = `${baseUrl}/room/${id}?edit=${room.edit_token}`;
    navigator.clipboard.writeText(editLink);
    toast.success("Edit link copied!");
  };

  const deleteShare = async (shareId: string) => {
    if (!hasEditPermission && room?.permissions === "view") {
      toast.error("This room is view-only");
      return;
    }

    const { error } = await supabase.from("shares").delete().eq("id", shareId);

    if (error) {
      toast.error("Failed to delete share");
    } else {
      toast.success("Share deleted");
    }
  };

  const updateRoomSettings = async (updates: {
    password?: string | null;
    permissions?: "view" | "edit";
    expiry?: string | null;
  }) => {
    if (!isCreator) {
      toast.error("Only room creator can modify settings");
      return;
    }

    // Get creator token from localStorage
    const creatorToken = localStorage.getItem(`room_creator_${id}`);
    if (!creatorToken) {
      toast.error("Creator token not found. Cannot update room settings.");
      return;
    }

    // Prepare parameters for RPC call - only include what needs updating
    const rpcParams: any = {
      p_room_id: id,
      p_creator_token: creatorToken,
    };

    // Handle password changes
    if (updates.password !== undefined) {
      rpcParams.p_update_password = true;
      if (updates.password === null) {
        // Removing password - pass null explicitly
        rpcParams.p_password = null;
        // Generate new encryption key for future content
        const newKey = await generateKey();
        localStorage.setItem(`room_key_${id}`, newKey);
        setEncryptionKey(newKey);
        setIsPasswordKey(false);
        localStorage.removeItem(`room_password_${id}`);
      } else {
        // Setting or changing password - hash it
        const trimmedPassword = updates.password.trim();
        rpcParams.p_password = await hashPassword(trimmedPassword);
        // Store original trimmed password for encryption
        localStorage.setItem(`room_password_${id}`, trimmedPassword);
        setEncryptionKey(trimmedPassword);
        setIsPasswordKey(true);
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

    // Reload room data
    await loadRoom(true);
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

          <Card className="glass-card p-4 space-y-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {room?.expires_at ? (
                  <span>Expires {formatDistanceToNow(new Date(room.expires_at), { addSuffix: true })}</span>
                ) : (
                  <span>Never expires</span>
                )}
              </div>
            </div>
            
            {/* Link Manager */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="text-sm font-medium mb-2">Room Links</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 flex items-center gap-2 p-2 bg-background/50 rounded-md">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">View Link (Read-only)</div>
                    <div className="text-xs truncate">{window.location.origin}/room/{id}</div>
                  </div>
                  <Button
                    onClick={copyViewLink}
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                {room?.edit_token && (
                  <div className="flex-1 flex items-center gap-2 p-2 bg-primary/10 rounded-md border border-primary/20">
                    <Edit2 className="w-4 h-4 text-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-primary font-medium">Edit Link (Full Access)</div>
                      <div className="text-xs truncate">{window.location.origin}/room/{id}?edit={room.edit_token.substring(0, 8)}...</div>
                    </div>
                    <Button
                      onClick={copyEditLink}
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
              {room?.edit_token && (
                <p className="text-xs text-muted-foreground">
                  ⚠️ Keep the edit link private - anyone with it can modify content
                </p>
              )}
            </div>
          </Card>

          <RoomSettings 
            room={room} 
            isPasswordProtected={!!room?.password}
            isEncrypted={!!encryptionKey}
            isCreator={isCreator}
            onSettingsUpdate={updateRoomSettings}
          />
        </motion.div>

        {/* Split View Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Side: Upload Sections */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            <h2 className="text-xl font-bold mb-4">Share Content</h2>
            
            <Card className="glass-card p-6 space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                Upload File
              </h3>
                <FileUpload 
                roomId={id!} 
                onUploadComplete={loadRoom}
                encryptionKey={encryptionKey}
                isPasswordKey={isPasswordKey}
                disabled={!hasEditPermission && room?.permissions === "view"}
              />
            </Card>

            <Card className="glass-card p-6 space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Code className="w-5 h-5 text-primary" />
                Share Code Snippet
              </h3>
              <CodeSnippetUpload 
              onShare={handleShareCode}
              disabled={!hasEditPermission && room?.permissions === "view"}
            />
            </Card>

            <Card className="glass-card p-6 space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Share Text
              </h3>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste your text here..."
                className="min-h-32 bg-background/50"
              />
              <Button onClick={handleShareText} className="w-full gradient-warm">
                Share Text
              </Button>
            </Card>

            <Card className="glass-card p-6 space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" />
                Share URL
              </h3>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="bg-background/50"
              />
              <Button onClick={handleShareUrl} className="w-full gradient-warm">
                Share URL
              </Button>
            </Card>
          </motion.div>

          {/* Right Side: Content Display with Tabs */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            <h2 className="text-xl font-bold mb-4">Content</h2>
            
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
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {shares
                      .filter((share) => {
                        if (activeTab === "all") return true;
                        if (activeTab === "files") return share.type === "file";
                        if (activeTab === "links") return share.type === "url";
                        if (activeTab === "code" || activeTab === "text") {
                          return share.type === "text";
                        }
                        return true;
                      })
                      .map((share) => (
                        <Card key={share.id} className="glass-card p-6 relative group">
                          {(hasEditPermission || room?.permissions === "edit") && (
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
                          canDelete={hasEditPermission || room?.permissions === "edit"}
                          onDelete={() => deleteShare(share.id)}
                        />
                        </Card>
                      ))}
                  </div>
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