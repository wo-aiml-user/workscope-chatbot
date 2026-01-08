import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Copy, MoreHorizontal, Upload, Folder, MessageCircle, Plus, User, Bot } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadFile, sendInitialInput, sendInput, updateDeveloperProfile, ApiResponse } from '@/services/api';
import { v4 as uuidv4 } from 'uuid';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// --- HELPER FUNCTIONS AND COMPONENTS ---
const processApiResponseData = (response: ApiResponse): string => {
    let rawContent = response.content;

    // Attempt to extract JSON if it's wrapped in markdown code blocks or has extra text
    const jsonMatch = rawContent.match(/```json\n([\s\S]*?)\n```/) ||
        rawContent.match(/```([\s\S]*?)```/) ||
        [null, rawContent]; // Fallback if no code blocks

    const potentialJson = jsonMatch[1] || rawContent;

    let data: any;
    try {
        data = JSON.parse(potentialJson.trim());
    } catch (e) {
        // If parsing the extracted string fails, try finding the first { and last }
        const firstBrace = rawContent.indexOf('{');
        const lastBrace = rawContent.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            try {
                data = JSON.parse(rawContent.substring(firstBrace, lastBrace + 1));
            } catch (innerError) {
                console.warn("Failed to parse extracted JSON block:", innerError);
                data = { summary: rawContent };
            }
        } else if (response.current_stage === 'features') {
            data = {
                features: rawContent.split('\n').filter(line => line.trim().startsWith('- ')).map(line => line.substring(2).trim())
            };
        } else {
            data = { summary: rawContent };
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

const FormattedSection = ({ title, content, children }: { title: string, content?: string, children?: React.ReactNode }) => (
    <div>
        <h2 className="text-lg font-bold text-foreground mb-2 border-b border-border pb-1">{title}</h2>
        {content && <div className="whitespace-pre-wrap leading-relaxed"><ParsedContent text={content} /></div>}
        {children && <div className="mt-2">{children}</div>}
    </div>
);

const DevelopmentEstimation = ({ data }: { data: { headers: string[], rows: string[][], frontend_total: string, backend_total: string, development_total: string } }) => (
    <div className="my-2">
        <table className="w-full text-sm">
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
                <tr className="border-t-2 border-border font-semibold bg-muted/50">
                    <td className="p-2">Total</td>
                    <td className="p-2">{data.frontend_total}</td>
                    <td className="p-2">{data.backend_total}</td>
                </tr>
                <tr className="font-bold bg-primary/10">
                    <td className="p-2" colSpan={2}>Development Total</td>
                    <td className="p-2">{data.development_total} hours</td>
                </tr>
            </tbody>
        </table>
    </div>
);

const OtherEstimation = ({ data }: { data: { headers: string[], rows: string[][], total: string } }) => (
    <div className="my-2">
        <table className="w-full text-sm">
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
                <tr className="font-bold bg-primary/10">
                    <td className="p-2">Total</td>
                    <td className="p-2">{data.total} hours</td>
                </tr>
            </tbody>
        </table>
    </div>
);

// Legacy support for old effort_estimation_table format
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
    const sectionOrder = ['overview', 'user_roles_and_key_features', 'feature_breakdown', 'workflow', 'milestone_plan', 'tech_stack', 'development_estimation', 'other_estimation', 'effort_estimation_table', 'deliverables', 'out_of_scope', 'client_responsibilities', 'technical_requirements', 'general_notes'];
    const dataMap = new Map(Object.entries(data));

    return (
        <div className="space-y-6 text-left">
            {sectionOrder.map(key => {
                if (!dataMap.has(key) || key === 'follow_up_question') return null;
                const value = dataMap.get(key);
                const title = formatTitle(key);

                // Tech Stack
                if (key === 'tech_stack' && typeof value === 'object' && value !== null) {
                    const techStackData = { ...value } as any;
                    delete techStackData.follow_up_question;
                    return (
                        <div key={key}>
                            <h2 className="text-lg font-bold text-foreground mb-2 border-b border-border pb-1">{title}</h2>
                            <div className="py-2"><TechStack data={techStackData} /></div>
                        </div>
                    );
                }

                // Development Estimation (new format)
                if (key === 'development_estimation' && typeof value === 'object' && value !== null && 'headers' in value && 'rows' in value) {
                    return (
                        <div key={key}>
                            <h2 className="text-lg font-bold text-foreground mb-2 border-b border-border pb-1">Development Estimation</h2>
                            <DevelopmentEstimation data={value as any} />
                        </div>
                    );
                }

                // Other Estimation (new format)
                if (key === 'other_estimation' && typeof value === 'object' && value !== null && 'headers' in value && 'rows' in value) {
                    return (
                        <div key={key}>
                            <h2 className="text-lg font-bold text-foreground mb-2 border-b border-border pb-1">Other Estimation</h2>
                            <OtherEstimation data={value as any} />
                        </div>
                    );
                }

                // Legacy effort_estimation_table (for backward compatibility)
                if (key === 'effort_estimation_table' && typeof value === 'object' && value !== null && 'headers' in value && 'rows' in value) {
                    return (
                        <div key={key}>
                            <h2 className="text-lg font-bold text-foreground mb-2 border-b border-border pb-1">{title}</h2>
                            <EffortTable data={value as any} />
                        </div>
                    );
                }

                // Text sections
                if (typeof value === 'string' && value.trim() !== '') {
                    return <FormattedSection key={key} title={title} content={value} />;
                }

                return null;
            })}
            {data.follow_up_question && <FollowUpQuestion question={data.follow_up_question} />}
        </div>
    );
};


const MessageContent = ({ content }: { content: string }) => {
    try {
        const data = JSON.parse(content);

        // Check for specific UI components first
        if (data.confirmation_message && data.updated_component) return <FinalAdjustment data={data} />;

        // Scope of Work detection (now more flexible)
        if (data.overview && (data.feature_breakdown || data.development_estimation || data.effort_estimation_table)) {
            return <ScopeOfWork data={data} />;
        }

        // Tech Stack
        if (data.frontend && data.backend) return <TechStack data={data} />;

        // Features
        if (data.features && Array.isArray(data.features)) return <FeatureList data={data} />;

        // Summary / Overview
        if (data.summary || data.overview) return <Summary data={{ summary: data.summary || data.overview, follow_up_question: data.follow_up_question }} />;

        // Fallback for objects that don't match known structures
        return (
            <div className="bg-muted/30 p-4 rounded-lg border border-border">
                <pre className="text-xs whitespace-pre-wrap font-mono">{JSON.stringify(data, null, 2)}</pre>
            </div>
        );
    } catch (e) {
        // If not JSON, render as markdown-style text
        return <p className="whitespace-pre-wrap leading-relaxed"><ParsedContent text={content} /></p>;
    }
};


// --- MAIN CHAT COMPONENT (No other changes needed below) ---
interface Message { id: string; content: string; sender: 'user' | 'assistant'; timestamp: Date; }
export interface Session { id: string; name: string; type: 'folder' | 'chat'; fileName?: string; messages: Message[]; developerProfile?: string; }

const Chat = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [message, setMessage] = useState('');
    const [sessions, setSessions] = useState<Session[]>([]);
    const [currentSession, setCurrentSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [developerProfile, setDeveloperProfile] = useState('');
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
                setDeveloperProfile(session?.developerProfile || '');
            } else {
                setCurrentSession(null);
                setDeveloperProfile('');
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
            const response = await uploadFile(newSessionId, file, developerProfile);
            const assistantMessageContent = processApiResponseData(response);
            const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");
            const newSession: Session = {
                id: newSessionId,
                name: nameWithoutExtension,
                type: 'folder',
                fileName: file.name,
                developerProfile: developerProfile,
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
        const newSession: Session = { id: newSessionId, name: "New Chat", type: 'chat', developerProfile: developerProfile, messages: [] };
        const updatedSessions = [...sessions, newSession];
        updateAndSaveSessions(updatedSessions);
        navigate(`/chat/${newSessionId}`);
    }

    const handleDeveloperProfileChange = async (value: string) => {
        setDeveloperProfile(value);
        if (currentSession) {
            const updatedSession = { ...currentSession, developerProfile: value };
            const updatedSessions = sessions.map(s => s.id === currentSession.id ? updatedSession : s);
            setCurrentSession(updatedSession);
            updateAndSaveSessions(updatedSessions);
        }
    }

    const saveDeveloperProfile = async () => {
        if (!currentSession || !developerProfile.trim()) return;

        try {
            await updateDeveloperProfile(currentSession.id, developerProfile);
            toast({
                title: "Profile Updated",
                description: "Developer profile has been saved and sent to the backend.",
            });
        } catch (error) {
            toast({
                title: "Update Failed",
                description: "Failed to update profile on the server.",
                variant: "destructive"
            });
        }
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
            const response = isInitialMessageInChat ? await sendInitialInput(currentSession.id, userMessageContent, developerProfile) : await sendInput(currentSession.id, userMessageContent);
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
                        {/* Chat Header with Developer Profile */}
                        <div className="p-6 border-b border-border bg-card">
                            <div className="flex items-center justify-between mb-4">
                                <h1 className="text-xl font-semibold text-foreground">{currentSession.name}</h1>
                                {currentSession.developerProfile && (
                                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                                        Profile Active
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-4">
                                <label className="text-sm font-medium text-foreground whitespace-nowrap">Developer Profile:</label>
                                <div className="relative flex-1 flex gap-2">
                                    <input
                                        type="text"
                                        value={developerProfile}
                                        onChange={(e) => handleDeveloperProfileChange(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveDeveloperProfile()}
                                        placeholder="e.g., Senior Developer, 5 years experience with React"
                                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                    <Button
                                        onClick={saveDeveloperProfile}
                                        variant="outline"
                                        size="sm"
                                        className="whitespace-nowrap"
                                    >
                                        Save Profile
                                    </Button>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">Enter your role and experience level then click Save. The LLM will adjust hour estimates based on this profile.</p>
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