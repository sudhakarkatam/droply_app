import { useState } from "react";
import { Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface CodeSnippetUploadProps {
  onShare: (code: string, language: string) => void;
  disabled?: boolean;
}

const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "c", label: "C" },
  { value: "csharp", label: "C#" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
];

export function CodeSnippetUpload({ onShare, disabled }: CodeSnippetUploadProps) {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("javascript");

  const handleShare = () => {
    if (!code.trim()) return;
    onShare(`\`\`\`${language}\n${code}\n\`\`\``, language);
    setCode("");
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="space-y-2">
        <Label htmlFor="language" className="text-sm sm:text-base">Language</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger id="language" className="bg-background/50 text-sm sm:text-base">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="code" className="text-sm sm:text-base">Code</Label>
        <Textarea
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste your code here..."
          className="min-h-32 sm:min-h-40 md:min-h-48 font-mono text-xs sm:text-sm bg-background/50"
        />
      </div>

      <Button 
        onClick={handleShare} 
        disabled={disabled || !code.trim()}
        className="w-full gradient-warm text-sm sm:text-base"
      >
        <Code className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
        Share Code Snippet
      </Button>
    </div>
  );
}
