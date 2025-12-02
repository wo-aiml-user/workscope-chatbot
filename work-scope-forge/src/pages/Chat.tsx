import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Copy, MoreHorizontal, Upload, Folder, MessageCircle, Plus, User, Bot } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadFile, sendInitialInput, sendInput, ApiResponse } from '@/services/api';
import { v4 as uuidv4 } from 'uuid';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// --- HELPER FUNCTIONS AND COMPONENTS ---
const processApiResponseData = (response: ApiResponse): string => {
    let data: any;
    try {
        data = JSON.parse(response.content);
    } catch (e) {
        if (response.current_stage === 'features') {
            data = {
                features: response.content.split('\n').filter(line => line.trim().startsWith('- ')).map(line => line.substring(2).trim())
            };
        } else {
            data = { summary: response.content };
        }
    }

    if (response.follow_up_question) {
        let cleanQuestion = response.follow_up_question;
        if (cleanQuestion.startsWith('[') && cleanQuestion.endsWith(']')) {
            try {
                const parsedArray = JSON.parse(cleanQuestion);
                if (Array.isArray(parsedArray) && parsedArray.length > 0) {
                    cleanQuestion = parsedArray.join(' ');
                }
            } catch (parseError) {
                console.warn("Could not parse follow-up question as an array:", cleanQuestion);
            }
        }
        if (!data.follow_up_question) {
            data.follow_up_question = cleanQuestion;
        }
    }
    return JSON.stringify(data);
};

const ParsedContent = ({ text }: { text: string }) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return (<>{parts.map((part, i) => part.startsWith('**') && part.endsWith('**') ? (<strong key={i}>{part.slice(2, -2)}</strong>) : (part))}</>);
};

const FollowUpQuestion = ({ question }: { question: string }) => (<div className="mt-4"><p className="whitespace-pre-wrap leading-relaxed"><ParsedContent text={question} /></p></div>);
const Summary = ({ data }: { data: { summary: string, follow_up_question?: string } }) => (<div><p className="whitespace-pre-wrap leading-relaxed"><ParsedContent text={data.summary} /></p>{data.follow_up_question && <FollowUpQuestion question={data.follow_up_question} />}</div>);
const FeatureList = ({ data }: { data: { features: string[], follow_up_question?: string } }) => (<div><ul className="list-disc list-inside space-y-2">{data.features.map((item, index) => <li key={index}><ParsedContent text={item} /></li>)}</ul>{data.follow_up_question && <FollowUpQuestion question={data.follow_up_question} />}</div>);

const TechStack = ({ data }: { data: Record<string, any> }) => {
    const formatTitle = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return (<div><div className="space-y-2">{Object.entries(data).map(([category, items]) => { if (category === 'follow_up_question' || !Array.isArray(items)) return null; return (<p key={category} className="leading-relaxed"><strong className="font-semibold text-foreground">{formatTitle(category)}:</strong>{' '}<ParsedContent text={(items as string[]).join(', ')} /></p>); })}</div>{data.follow_up_question && <FollowUpQuestion question={data.follow_up_question} />}</div>);
};

const FormattedSection = ({ title, content }: { title: string, content: string }) => (<div><h2 className="text-lg font-bold text-foreground mb-2 border-b border-border pb-1">{title}</h2><div className="whitespace-pre-wrap leading-relaxed"><ParsedContent text={content} /></div></div>);

const EffortTable = ({ data }: { data: { headers: string[], rows: string[][] } }) => (
    <table className="w-full text-sm my-2">
        <thead>
            <tr className="border-b border-border">
                {data.headers.map(header => <th key={header} className="p-2 text-left font-semibold">{header}</th>)}
            </tr>
        </thead>
        <tbody>
            {data.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border/50">
                    {row.map((cell, cellIndex) => <td key={cellIndex} className="p-2">{cell}</td>)}
                </tr>
            ))}
        </tbody>
    </table>
);

// MODIFIED: This component is now more robust to handle the generic key-value pair structure.
const FinalAdjustment = ({ data }: { data: { confirmation_message: string; updated_component: any; follow_up_question?: string } }) => {
    const formatTitle = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    // Extract the key and value from the updated_component object
    const componentKey = Object.keys(data.updated_component)[0];
    const componentValue = data.updated_component[componentKey];
    
    let componentToRender;

    if (componentValue && typeof componentValue === 'object' && componentValue !== null && 'headers' in componentValue && 'rows' in componentValue) {
        // It's the effort estimation table
        componentToRender = <FormattedSection title={formatTitle(componentKey)} content=""><EffortTable data={componentValue} /></FormattedSection>;
    } else if (typeof componentValue === 'string') {
        // It's a simple text component (like workflow, overview, etc.)
        componentToRender = <FormattedSection title={formatTitle(componentKey)} content={componentValue} />;
    } else {
        // Fallback for any other type of component
        componentToRender = <div><h2 className="text-lg font-bold text-foreground mb-2">{formatTitle(componentKey)}</h2><pre className="text-xs whitespace-pre-wrap">{JSON.stringify(componentValue, null, 2)}</pre></div>;
    }

    return (
        <div>
            <p className="whitespace-pre-wrap leading-relaxed mb-4"><ParsedContent text={data.confirmation_message} /></p>
            {componentToRender}
            {data.follow_up_question && <FollowUpQuestion question={data.follow_up_question} />}
        </div>
    );
};

const ScopeOfWork = ({ data }: { data: any }) => {
    const formatTitle = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const sectionOrder = ['overview', 'user_roles_and_key_features', 'feature_breakdown', 'workflow', 'milestone_plan', 'tech_stack', 'effort_estimation_table', 'deliverables', 'out_of_scope', 'client_responsibilities', 'technical_requirements', 'general_notes'];
    const dataMap = new Map(Object.entries(data));
    return (<div className="space-y-6 text-left">{sectionOrder.map(key => { if (!dataMap.has(key) || key === 'follow_up_question') return null; const value = dataMap.get(key); const title = formatTitle(key); if (key === 'tech_stack' && typeof value === 'object' && value !== null) { const techStackData = { ...value }; delete techStackData.follow_up_question; return (<div key={key}><h2 className="text-lg font-bold text-foreground mb-2 border-b border-border pb-1">{title}</h2><div className="py-2"><TechStack data={techStackData} /></div></div>); } if (key === 'effort_estimation_table' && typeof value === 'object' && value !== null && 'headers' in value && 'rows' in value) { return (<div key={key}><h2 className="text-lg font-bold text-foreground mb-2 border-b border-border pb-1">{title}</h2><EffortTable data={value} /></div>); } if (typeof value === 'string' && value.trim() !== '') { return <FormattedSection key={key} title={title} content={value} />; } return null; })} {data.follow_up_question && <FollowUpQuestion question={data.follow_up_question} />}</div>);
};


const MessageContent = ({ content }: { content: string }) => {
    try {
        const data = JSON.parse(content);
        if (data.confirmation_message && data.updated_component) return <FinalAdjustment data={data} />;
        if (data.overview && data.effort_estimation_table) return <ScopeOfWork data={data} />;
        if (data.frontend && data.backend) return <TechStack data={data} />;
        if (data.features) return <FeatureList data={data} />;
        if (data.summary) return <Summary data={data} />;
        return <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>;
    } catch (e) {
        return <p className="whitespace-pre-wrap"><ParsedContent text={content} /></p>;
    }
};


// --- MAIN CHAT COMPONENT (No other changes needed below) ---
interface Message { id: string; content: string; sender: 'user' | 'assistant'; timestamp: Date; }
export interface Session { id: string; name: string; type: 'folder' | 'chat'; fileName?: string; messages: Message[]; }

const Chat = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [message, setMessage] = useState('');
    const [sessions, setSessions] = useState<Session[]>([]);
    const [currentSession, setCurrentSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const savedSessions = localStorage.getItem('work-scope-sessions');
        if (savedSessions) {
            const parsedSessions: Session[] = JSON.parse(savedSessions).map((s: any) => ({ ...s, messages: s.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })) }));
            setSessions(parsedSessions);
            if (sessionId) {
                const session = parsedSessions.find((s) => s.id === sessionId);
                setCurrentSession(session || null);
            } else {
                setCurrentSession(null);
            }
        }
    }, [sessionId]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            const scrollHeight = textareaRef.current.scrollHeight;
            textareaRef.current.style.height = `${scrollHeight}px`;
        }
    }, [message]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [currentSession?.messages, isLoading]);

    const updateAndSaveSessions = (newSessions: Session[]) => {
        setSessions(newSessions);
        localStorage.setItem('work-scope-sessions', JSON.stringify(newSessions));
    }

    const deleteSession = (sessionIdToDelete: string) => {
        const updatedSessions = sessions.filter(s => s.id !== sessionIdToDelete);
        updateAndSaveSessions(updatedSessions);
        if (currentSession?.id === sessionIdToDelete) navigate('/');
        toast({ title: "Session deleted" });
    };

    const handleFileUpload = () => fileInputRef.current?.click();

    const onFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (event.target) event.target.value = '';
        if (!file) return;

        setIsLoading(true);
        toast({ title: "Uploading...", description: `Processing: ${file.name}` });

        try {
            const newSessionId = uuidv4();
            const response = await uploadFile(newSessionId, file);
            const assistantMessageContent = processApiResponseData(response);
            const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
            const newSession: Session = {
                id: newSessionId,
                name: nameWithoutExtension,
                type: 'folder',
                fileName: file.name,
                messages: [{
                    id: uuidv4(),
                    content: assistantMessageContent,
                    sender: 'assistant',
                    timestamp: new Date()
                }],
            };
            const updatedSessions = [...sessions, newSession];
            updateAndSaveSessions(updatedSessions);
            navigate(`/chat/${newSession.id}`);
        } catch (error) {
            toast({ title: "Upload Error", description: error instanceof Error ? error.message : "An unknown error occurred.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleNewChat = () => {
        const newSessionId = uuidv4();
        const newSession: Session = { id: newSessionId, name: "New Chat", type: 'chat', messages: [] };
        const updatedSessions = [...sessions, newSession];
        updateAndSaveSessions(updatedSessions);
        navigate(`/chat/${newSessionId}`);
    }

    const handleSendMessage = async () => {
        if (!message.trim() || !currentSession || isLoading) return;
        const userMessageContent = message;
        setMessage('');
        const userMessage: Message = {
            id: uuidv4(),
            content: userMessageContent,
            sender: 'user',
            timestamp: new Date()
        };
        const isInitialMessageInChat = currentSession.type === 'chat' && currentSession.messages.length === 0;
        const updatedSessionWithUserMessage = { ...currentSession, name: isInitialMessageInChat ? userMessageContent.substring(0, 30) + (userMessageContent.length > 30 ? '...' : '') : currentSession.name, messages: [...currentSession.messages, userMessage], };
        const sessionsWithUserMessage = sessions.map(s => s.id === currentSession.id ? updatedSessionWithUserMessage : s);
        setCurrentSession(updatedSessionWithUserMessage);
        setSessions(sessionsWithUserMessage);
        setIsLoading(true);

        try {
            const response = isInitialMessageInChat ? await sendInitialInput(currentSession.id, userMessageContent) : await sendInput(currentSession.id, userMessageContent);
            if (response) {
                const assistantMessageContent = processApiResponseData(response);
                const assistantMessage: Message = {
                    id: uuidv4(),
                    content: assistantMessageContent,
                    sender: 'assistant',
                    timestamp: new Date()
                };
                const finalSession = { ...updatedSessionWithUserMessage, messages: [...updatedSessionWithUserMessage.messages, assistantMessage] };
                const finalSessions = sessions.map(s => s.id === currentSession.id ? finalSession : s);
                setCurrentSession(finalSession);
                updateAndSaveSessions(finalSessions);
            }
        } catch (error) {
            toast({ title: "Connection Error", description: error instanceof Error ? error.message : "Failed to send message.", variant: "destructive" });
            updateAndSaveSessions(sessionsWithUserMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };
    
    const handleCopyMessage = (messageId: string) => {
        const element = document.getElementById(`message-content-${messageId}`);
        if (!element) {
            toast({ title: "Copy Failed", description: "Could not find message content.", variant: "destructive" });
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = element.innerText;
        
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';

        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand('copy');
            toast({ title: "Copied to clipboard" });
        } catch (err) {
            console.error("Failed to copy text: ", err);
            toast({ title: "Copy Failed", variant: "destructive" });
        } finally {
            document.body.removeChild(textarea);
        }
    };

    const folders = sessions.filter(s => s.type === 'folder');
    const chats = sessions.filter(s => s.type === 'chat');

    return (
        <div className="flex h-screen bg-gradient-background">
            {/* Sidebar */}
            <div className="w-80 bg-sidebar border-r border-sidebar-border flex-col hidden sm:flex">
                <div className="p-6 border-b border-sidebar-border"><h2 className="text-xl font-semibold text-sidebar-foreground">Work Scope Generator</h2></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    <div>
                        <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-medium text-sidebar-foreground">Folders</h3><Button variant="ghost" size="sm" onClick={handleFileUpload} className="text-primary hover:text-primary-foreground hover:bg-primary"><Upload className="h-4 w-4" /></Button></div>
                        <div className="space-y-1">{folders.map((folder) => (<div key={folder.id} className={`group p-3 rounded-lg cursor-pointer flex items-center justify-between hover-accent ${folder.id === sessionId ? 'active-indicator' : ''}`} onClick={() => navigate(`/chat/${folder.id}`)}><div className="flex items-center flex-1 min-w-0 space-x-3"><Folder className="h-4 w-4 text-primary flex-shrink-0" /><p className="text-sm font-medium text-sidebar-foreground truncate">{folder.name}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onClick={(e) => { e.stopPropagation(); deleteSession(folder.id); }} className="text-destructive">Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>))}</div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-medium text-sidebar-foreground">Chats</h3><Button variant="ghost" size="sm" onClick={handleNewChat} className="text-primary hover:text-primary-foreground hover:bg-primary"><Plus className="h-4 w-4" /></Button></div>
                        <div className="space-y-1">{chats.map((chat) => (<div key={chat.id} className={`group p-3 rounded-lg cursor-pointer flex items-center justify-between hover-accent ${chat.id === sessionId ? 'active-indicator' : ''}`} onClick={() => navigate(`/chat/${chat.id}`)}><div className="flex items-center flex-1 min-w-0 space-x-3"><MessageCircle className="h-4 w-4 text-primary flex-shrink-0" /><p className="text-sm font-medium text-sidebar-foreground truncate">{chat.name}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onClick={(e) => { e.stopPropagation(); deleteSession(chat.id); }} className="text-destructive">Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>))}</div>
                    </div>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col">
                {currentSession ? (
                    <>
                        {/* Chat Header */}
                        <div className="p-6 border-b border-border bg-card">
                            <h1 className="text-xl font-semibold text-foreground">{currentSession.name}</h1>
                        </div>
                        
                        {/* Scrollable Chat History */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {currentSession.messages.map((msg) => (
                                <div key={msg.id} className={`flex items-start gap-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.sender === 'assistant' && (<div className="flex-shrink-0 w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center"><Bot className="w-5 h-5 text-primary" /></div>)}
                                    <div id={`message-content-${msg.id}`} className="group relative max-w-4xl p-4 rounded-lg border bg-card">
                                        <MessageContent content={msg.content} />
                                        {msg.sender === 'assistant' && (
                                            <div className="absolute top-1 right-1">
                                                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-7 w-7" onClick={() => handleCopyMessage(msg.id)}>
                                                    <Copy className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                    {msg.sender === 'user' && (<div className="flex-shrink-0 w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center"><User className="w-5 h-5 text-primary" /></div>)}
                                </div>
                            ))}
                            {isLoading && (<div className="flex items-start gap-4 justify-start"><div className="flex-shrink-0 w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center"><Bot className="w-5 h-5 text-primary" /></div><div className="max-w-4xl p-4 rounded-lg border bg-card flex items-center justify-center space-x-1.5"><span className="dot dot-1"></span><span className="dot dot-2"></span><span className="dot dot-3"></span></div></div>)}
                            <div ref={messagesEndRef} />
                        </div>
                        
                        {/* Centered Chat Input Area */}
                        <div className="px-6 pb-6 pt-2">
                            <div className="relative w-full max-w-4xl mx-auto">
                                <div className="relative flex items-end w-full p-2 rounded-xl border border-border bg-card shadow-sm">
                                    <Textarea
                                        ref={textareaRef}
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={isLoading ? "Generating response..." : "Type your message..."}
                                        className="flex-1 resize-none bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 pr-12 min-h-[24px] max-h-48"
                                        rows={1}
                                        disabled={isLoading}
                                    />
                                    <Button
                                        onClick={handleSendMessage}
                                        disabled={!message.trim() || isLoading}
                                        size="icon"
                                        className="absolute right-3 bottom-2.5 h-8 w-8"
                                    >
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-center p-4">
                        <div>
                            <h2 className="text-2xl font-semibold text-foreground mb-2">Welcome!</h2>
                            <p className="text-muted-foreground max-w-md">Select a conversation or start a new one by uploading a document or clicking the <Plus className="inline h-4 w-4 mx-1" /> button.</p>
                        </div>
                    </div>
                )}
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf" onChange={onFileSelect} className="hidden" />
        </div>
    );
};

export default Chat;