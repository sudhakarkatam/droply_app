import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Sparkles, Eye, Edit, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateKey, hashPassword } from "@/lib/crypto";
import { CustomExpiryPicker } from "@/components/CustomExpiryPicker";

export function CreateRoomForm() {
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<"view" | "edit">("edit");
  const [expiry, setExpiry] = useState<string>("never");
  const [creating, setCreating] = useState(false);

  const generateRoomName = () => {
    const adjectives = ["swift", "bright", "cosmic", "quantum", "digital", "cyber"];
    const nouns = ["drop", "share", "flow", "sync", "hub", "vault"];
    const random = Math.floor(Math.random() * 1000);
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]}-${nouns[Math.floor(Math.random() * nouns.length)]}-${random}`;
  };

  const handleCreate = async () => {
    const finalRoomName = roomName.trim() || generateRoomName();
    
    // Validate room name
    if (finalRoomName.length < 3) {
      toast.error("Room name must be at least 3 characters");
      return;
    }

    if (finalRoomName.length > 50) {
      toast.error("Room name must be less than 50 characters");
      return;
    }

    // Check if room name is already taken
    const { data: existingRoom } = await supabase
      .from("rooms")
      .select("id")
      .eq("id", finalRoomName)
      .maybeSingle();

    if (existingRoom) {
      toast.error("Room name already taken. Please choose another.");
      return;
    }

    setCreating(true);

    try {
      // Calculate expiry date
      let expiresAt: string | null = null;
      if (expiry !== "never") {
        // Check if expiry is a preset or custom ISO date string
        if (expiry === "1h" || expiry === "24h" || expiry === "7d" || expiry === "30d") {
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
          expiresAt = now.toISOString();
        } else {
          // Custom date is already an ISO string
          expiresAt = expiry;
        }
      }

      // Generate encryption key for non-password rooms
      let encryptionKey = "";
      if (!password.trim()) {
        encryptionKey = await generateKey();
      }

      // Hash password before storing (if provided)
      const passwordHash = password.trim() ? await hashPassword(password.trim()) : null;

      // Generate creator token for room ownership
      const creatorToken = crypto.randomUUID();

      // Create room with settings
      const { error } = await supabase.from("rooms").insert({
        id: finalRoomName,
        password: passwordHash,
        permissions,
        expires_at: expiresAt,
        creator_token: creatorToken,
      });

      if (error) {
        throw error;
      }

      // Store room access data in localStorage (creator token persists)
      // Password stored in sessionStorage in Room component after verification
      localStorage.setItem(`room_creator_${finalRoomName}`, creatorToken);
      if (encryptionKey) {
        // For non-password rooms, store key in sessionStorage (clears on tab close)
        sessionStorage.setItem(`room_key_${finalRoomName}`, encryptionKey);
      }

      toast.success("Room created!");
      setTimeout(() => {
        // Include encryption key in URL fragment for non-password rooms
        const url = encryptionKey 
          ? `/room/${finalRoomName}#${encryptionKey}`
          : `/room/${finalRoomName}`;
        navigate(url);
      }, 300);
    } catch (error) {
      console.error("Error creating room:", error);
      toast.error("Failed to create room");
      setCreating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="max-w-md mx-auto"
    >
      <Card className="glass-card p-8 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">Create Your Room</h2>
          <p className="text-sm text-muted-foreground">
            Choose a memorable name and optional password
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="roomName">Room Name</Label>
            <div className="flex gap-2">
              <Input
                id="roomName"
                placeholder="my-awesome-room"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="bg-background/50"
                maxLength={50}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setRoomName(generateRoomName())}
                className="shrink-0"
              >
                <Sparkles className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {roomName ? `droply.app/room/${roomName}` : "Leave empty for auto-generated name"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Password (Optional)
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Protect your room"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-background/50"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              Password enables end-to-end encryption for your room
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
        </div>

        <Button
          onClick={handleCreate}
          disabled={creating}
          className="w-full gradient-warm glow-orange hover:scale-105 transition-transform"
        >
          {creating ? "Creating..." : "Create Room"}
        </Button>
      </Card>
    </motion.div>
  );
}