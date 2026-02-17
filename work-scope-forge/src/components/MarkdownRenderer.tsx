import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MarkdownRenderer = ({ content }: { content: string }) => {
    return (
        <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-4 text-primary border-b border-border pb-2" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-5 mb-3 text-foreground border-b border-border pb-1" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="text-lg font-bold mt-4 mb-2 text-foreground" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc list-inside space-y-1 my-2 text-foreground/90" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal list-inside space-y-1 my-2 text-foreground/90" {...props} />,
                    li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
                    p: ({ node, ...props }) => <p className="mb-3 leading-relaxed text-foreground/90 whitespace-pre-wrap" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-bold text-foreground" {...props} />,
                    table: ({ node, ...props }) => <div className="my-4 overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm border-collapse" {...props} /></div>,
                    thead: ({ node, ...props }) => <thead className="bg-muted text-muted-foreground font-semibold" {...props} />,
                    tr: ({ node, ...props }) => <tr className="border-b border-border/50 hover:bg-muted/50 transition-colors" {...props} />,
                    th: ({ node, ...props }) => <th className="p-3 text-left align-middle font-medium" {...props} />,
                    td: ({ node, ...props }) => <td className="p-3 align-middle border-l first:border-l-0 border-border/50" {...props} />,
                    code: ({ node, className, children, ...props }) => {
                        const isInline = !className;
                        if (isInline) {
                            return (
                                <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground" {...props}>
                                    {children}
                                </code>
                            );
                        }
                        return (
                            <code className="block overflow-x-auto rounded-md bg-muted p-3 text-sm font-mono text-foreground" {...props}>
                                {children}
                            </code>
                        );
                    },
                    blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground my-4" {...props} />,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownRenderer;
