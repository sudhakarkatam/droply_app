import { motion } from "framer-motion";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, Shield, Clock, Share2, Upload, Link2, Plus, LogIn } from "lucide-react";
import { CreateRoomForm } from "@/components/CreateRoomForm";
import { JoinRoomForm } from "@/components/JoinRoomForm";

export default function Index() {
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "join">("create");

  const features = [
    {
      icon: Zap,
      title: "Instant Sharing",
      description: "Create a room and start sharing in seconds. No signup required.",
    },
    {
      icon: Shield,
      title: "Privacy First",
      description: "Your data expires automatically. Set custom expiry times or delete on first view.",
    },
    {
      icon: Clock,
      title: "Smart Expiry",
      description: "Choose from 10 minutes to never. Perfect for temporary or permanent shares.",
    },
    {
      icon: Share2,
      title: "Share Anything",
      description: "Text, files, or URLs. All in one place, ready to share instantly.",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-8"
        >
          {/* Logo & Tagline */}
          <div className="space-y-4">
            <motion.h1
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="text-7xl font-bold text-gradient"
            >
              Droply
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-2xl text-muted-foreground"
            >
              Knowledge Drop — Unlock Your Brain One Byte at a Time
            </motion.p>
          </div>

          {/* CTA or Form */}
          {!showForm ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="flex gap-4 flex-wrap justify-center">
                <Button
                  onClick={() => {
                    setFormMode("create");
                    setShowForm(true);
                  }}
                  className="text-lg px-8 py-6 gradient-warm glow-orange hover:scale-105 transition-transform"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create Room
                </Button>
                <Button
                  onClick={() => {
                    setFormMode("join");
                    setShowForm(true);
                  }}
                  variant="outline"
                  className="text-lg px-8 py-6 hover:scale-105 transition-transform"
                >
                  <LogIn className="w-5 h-5 mr-2" />
                  Join Room
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">No registration. No hassle. Just share.</p>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {/* Mode Toggle */}
              <div className="flex justify-center gap-2">
                <Button
                  variant={formMode === "create" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormMode("create")}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create
                </Button>
                <Button
                  variant={formMode === "join" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormMode("join")}
                  className="gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Join
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
              </div>
              {formMode === "create" ? <CreateRoomForm /> : <JoinRoomForm />}
            </div>
          )}

          {/* Quick Demo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="max-w-3xl mx-auto mt-16"
          >
            <Card className="glass-card p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                <div className="space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">Upload Files</h3>
                  <p className="text-sm text-muted-foreground">
                    Drag & drop any file up to 10MB
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                    <Link2 className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">Share URLs</h3>
                  <p className="text-sm text-muted-foreground">
                    Paste links for quick access
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                    <Share2 className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">Copy & Share</h3>
                  <p className="text-sm text-muted-foreground">
                    One link to share it all
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-20"
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + index * 0.1 }}
            >
              <Card className="glass-card p-6 h-full hover:glow-orange transition-all duration-300">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Footer CTA */}
        {!showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-center mt-20 space-y-6"
          >
            <h2 className="text-3xl font-bold">Ready to drop some knowledge?</h2>
            <div className="flex gap-4 justify-center flex-wrap">
              <Button
                onClick={() => {
                  setFormMode("create");
                  setShowForm(true);
                }}
                className="px-8 py-4 gradient-warm glow-yellow hover:scale-105 transition-transform"
              >
                <Plus className="w-5 h-5 mr-2" />
                Create Room
              </Button>
              <Button
                onClick={() => {
                  setFormMode("join");
                  setShowForm(true);
                }}
                variant="outline"
                className="px-8 py-4 hover:scale-105 transition-transform"
              >
                <LogIn className="w-5 h-5 mr-2" />
                Join Room
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}