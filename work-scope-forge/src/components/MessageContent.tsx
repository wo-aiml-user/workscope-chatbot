import MarkdownRenderer from './MarkdownRenderer';
import { normalizeStoredMessage } from '@/lib/responseNormalizer';

const toTitle = (key: string): string =>
    key
        .replace(/_/g, ' ')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());

const formatPrimitive = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
};

const jsonToMarkdown = (value: unknown, level = 2): string => {
    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (item && typeof item === 'object') {
                    return `- ${jsonToMarkdown(item, level + 1).replace(/^\s+/, '')}`;
                }
                return `- ${formatPrimitive(item)}`;
            })
            .join('\n');
    }

    if (value && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>)
            .map(([key, val]) => {
                const heading = `${'#'.repeat(Math.min(level, 6))} ${toTitle(key)}`;
                if (Array.isArray(val) || (val && typeof val === 'object')) {
                    const nested = jsonToMarkdown(val, level + 1);
                    return `${heading}\n${nested}`;
                }
                return `${heading}\n${formatPrimitive(val)}`;
            })
            .join('\n\n');
    }

    return formatPrimitive(value);
};

const MessageContent = ({ content }: { content: string }) => {
    const payload = normalizeStoredMessage(content);
    const contentToRender = payload.content;
    const isObjectContent = typeof contentToRender === 'object' && contentToRender !== null;
    const normalizedContent = isObjectContent
        ? jsonToMarkdown(contentToRender)
        : String(contentToRender ?? '');

    return (
        <div>
            <MarkdownRenderer content={normalizedContent} />

            {payload.follow_up_question && (
                <div className="mt-4 pt-4 border-t border-border/50">
                    <h4 className="text-xs font-bold uppercase text-primary mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        Follow-up Question
                    </h4>
                    <div className="text-sm text-foreground/90 italic bg-muted/30 p-3 rounded border border-border/50">
                        {payload.follow_up_question}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MessageContent;
