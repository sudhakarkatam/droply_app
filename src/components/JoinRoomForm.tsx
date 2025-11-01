import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LogIn, Hash } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function JoinRoomForm() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    const finalRoomId = roomId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    
    if (!finalRoomId || finalRoomId.length < 3) {
      toast.error("Please enter a valid room ID");
      return;
    }

    if (finalRoomId.length > 50) {
      toast.error("Room ID must be less than 50 characters");
      return;
    }

    setJoining(true);

    try {
      // Check if room exists
      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("id, expires_at")
        .eq("id", finalRoomId)
        .maybeSingle();

      if (roomError) {
        throw roomError;
      }

      if (!roomData) {
        toast.error("Room not found");
        setJoining(false);
        return;
      }

      // Check if room is expired
      if (roomData.expires_at && new Date(roomData.expires_at) < new Date()) {
        toast.error("This room has expired");
        setJoining(false);
        return;
      }

      // Navigate to room
      toast.success("Joining room...");
      navigate(`/room/${finalRoomId}`);
    } catch (error) {
      console.error("Error joining room:", error);
      toast.error("Failed to join room");
      setJoining(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleJoin();
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
          <h2 className="text-2xl font-bold">Join a Room</h2>
          <p className="text-sm text-muted-foreground">
            Enter the room ID to access shared content
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="roomId" className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Room ID
            </Label>
            <Input
              id="roomId"
              placeholder="e.g., my-awesome-room"
              value={roomId}
              onChange={(e) => {
                const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                setRoomId(value);
              }}
              onKeyPress={handleKeyPress}
              className="bg-background/50"
              maxLength={50}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {roomId ? `droply.app/room/${roomId}` : "Enter the room ID you received"}
            </p>
          </div>
        </div>

        <Button
          onClick={handleJoin}
          disabled={joining || !roomId.trim()}
          className="w-full gradient-warm glow-orange hover:scale-105 transition-transform"
        >
          <LogIn className="w-4 h-4 mr-2" />
          {joining ? "Joining..." : "Join Room"}
        </Button>
      </Card>
    </motion.div>
  );
}

