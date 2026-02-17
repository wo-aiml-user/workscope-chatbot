import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { sendMessage } from '@/services/api';
import { Session } from './Chat';

const Index = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDirectChat = () => {
    const sessionId = Date.now().toString();
    const newSession: Session = {
      id: sessionId,
      name: 'New Chat',
      type: 'chat',
      messages: [],
    };

    const existingSessions = JSON.parse(localStorage.getItem('work-scope-sessions') || '[]');
    const updatedSessions = [...existingSessions, newSession];
    localStorage.setItem('work-scope-sessions', JSON.stringify(updatedSessions));

    navigate(`/chat/${sessionId}`);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = '';

    toast({
      title: "Uploading...",
      description: `Processing your document: ${file.name}`,
    });

    try {
      const sessionId = Date.now().toString();
      const response = await sendMessage(sessionId, "", [], file);
      const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");

      let combinedContent = response.content;
      if (response.follow_up_question) {
        combinedContent += `\n\n${response.follow_up_question}`;
      }

      const newSession: Session = {
        id: sessionId,
        name: nameWithoutExtension,
        type: 'folder',
        fileName: file.name,
        messages: [{
          id: Date.now().toString(),
          content: combinedContent,
          sender: 'assistant',
          timestamp: new Date()
        }],
      };

      const existingSessions = JSON.parse(localStorage.getItem('work-scope-sessions') || '[]');
      const updatedSessions = [...existingSessions, newSession];
      localStorage.setItem('work-scope-sessions', JSON.stringify(updatedSessions));
      navigate(`/chat/${sessionId}`);

    } catch (error) {
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-background flex items-center justify-center p-8">
      {/* MODIFIED: Wider container and more vertical spacing */}
      <div className="w-full max-w-4xl mx-auto text-center space-y-12">

        {/* MODIFIED: Header Section with bigger text */}
        <div className="space-y-6">
          <h1 className="text-5xl font-bold text-foreground">
            Work Scope Generator
          </h1>
          <h2 className="text-3xl font-medium text-foreground/90">
            How can I help you today?
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Generate a comprehensive scope of work by uploading your requirements or engaging in a direct conversation with AI.
          </p>
        </div>

        {/* MODIFIED: Action Cards section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card
            className="bg-gradient-card border-border hover:border-primary/50 transition-all duration-300 cursor-pointer transform hover:scale-105"
            onClick={handleUploadClick}
          >
            <CardContent className="p-10 text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <Upload className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-2xl font-semibold text-foreground">
                Upload Document
              </h3>
              <p className="text-muted-foreground">
                Provide a PDF with your project requirements and let the AI analyze it.
              </p>
            </CardContent>
          </Card>

          <Card
            className="bg-gradient-card border-border hover:border-primary/50 transition-all duration-300 cursor-pointer transform hover:scale-105"
            onClick={handleDirectChat}
          >
            <CardContent className="p-10 text-center space-y-4">
              <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <MessageCircle className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-2xl font-semibold text-foreground">
                Direct Chat
              </h3>
              <p className="text-muted-foreground">
                Start a conversation to describe your project and build the scope interactively.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Hidden file input (no changes needed) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

export default Index;