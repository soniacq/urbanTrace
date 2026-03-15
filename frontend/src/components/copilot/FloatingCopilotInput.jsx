import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Terminal, Trash2 } from 'lucide-react';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TOOL_EVENT_DELAY_MS = 140;
const RESPONSE_STREAM_DELAY_MS = 16;

const FloatingCopilotInput = ({ nodes = [], edges = [], onCopilotActions }) => {
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [traceLogs, setTraceLogs] = useState([]);
  const [traceMinimized, setTraceMinimized] = useState(true);
  const traceBodyRef = useRef(null);

  const traceColorMap = useMemo(() => ({
    user: '#0f172a',
    tool_call: '#0f766e',
    tool_response: '#1d4ed8',
    assistant: '#334155',
    system: '#64748b',
    error: '#b91c1c',
  }), []);

  const appendTrace = useCallback((type, text) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setTraceLogs((prev) => prev.concat({
      id,
      type,
      text,
      timestamp: new Date().toLocaleTimeString(),
    }));
    return id;
  }, []);

  const updateTraceText = useCallback((entryId, nextText) => {
    setTraceLogs((prev) =>
      prev.map((entry) => (entry.id === entryId ? { ...entry, text: nextText } : entry))
    );
  }, []);

  useEffect(() => {
    if (!traceBodyRef.current || traceMinimized) return;
    traceBodyRef.current.scrollTop = traceBodyRef.current.scrollHeight;
  }, [traceLogs, traceMinimized]);

  const streamAssistantResponse = useCallback(async (responseText) => {
    if (!responseText) {
      appendTrace('assistant', '(empty response)');
      return;
    }

    const fullText = String(responseText);
    const entryId = appendTrace('assistant', '');
    let visible = '';

    for (let idx = 0; idx < fullText.length; idx += 3) {
      visible += fullText.slice(idx, idx + 3);
      updateTraceText(entryId, visible);
      // Tiny delay for a lightweight streaming feel.
      // eslint-disable-next-line no-await-in-loop
      await wait(RESPONSE_STREAM_DELAY_MS);
    }
  }, [appendTrace, updateTraceText]);

  const sendCopilotMessage = useCallback(async () => {
    const message = chatInput.trim();
    if (!message || isSending) return;

    setTraceMinimized(false);
    appendTrace('user', message);
    setIsSending(true);

    try {
      const response = await fetch('http://localhost:8000/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          nodes,
          edges,
          log_stream: true
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err?.detail || 'Failed to send message');
      }

      const payload = await response.json();
      const toolCalls = Array.isArray(payload?.tool_calls) ? payload.tool_calls : [];
      const toolResponses = Array.isArray(payload?.tool_responses) ? payload.tool_responses : [];
      const actions = Array.isArray(payload?.actions) ? payload.actions : [];

      if (toolCalls.length === 0) {
        appendTrace('tool_call', '(no tool calls)');
      } else {
        for (const toolCall of toolCalls) {
          appendTrace('tool_call', JSON.stringify(toolCall));
          // eslint-disable-next-line no-await-in-loop
          await wait(TOOL_EVENT_DELAY_MS);
        }
      }

      if (toolResponses.length === 0) {
        appendTrace('tool_response', '(no tool responses)');
      } else {
        for (const toolResponse of toolResponses) {
          appendTrace('tool_response', JSON.stringify(toolResponse));
          // eslint-disable-next-line no-await-in-loop
          await wait(TOOL_EVENT_DELAY_MS);
        }
      }

      await streamAssistantResponse(payload?.message || '');

      if (payload?.message) {
        console.log('[Copilot]', payload.message);
      }

      if (actions.length > 0 && typeof onCopilotActions === 'function') {
        await onCopilotActions(actions);
        appendTrace('system', `Applied ${actions.length} frontend action(s).`);
      }

      setChatInput('');
    } catch (error) {
      console.error('Copilot send error:', error);
      appendTrace('error', error?.message || 'Copilot send error');
    } finally {
      setIsSending(false);
    }
  }, [appendTrace, chatInput, edges, isSending, nodes, onCopilotActions, streamAssistantResponse]);

  const onChatKeyDown = useCallback((event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendCopilotMessage();
    }
  }, [sendCopilotMessage]);

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '16px',
        transform: 'translateX(-50%)',
        paddingLeft: '30px',
        boxSizing: 'border-box',
        width: 'min(760px, calc(100% - 40px))',
        zIndex: 40
      }}
    >
      <div
        style={{
          marginBottom: '8px',
          borderRadius: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.62)',
          border: '1px solid rgba(203, 213, 225, 0.75)',
          boxShadow: '0 8px 18px rgba(15, 23, 42, 0.08)',
          backdropFilter: 'blur(8px)',
          overflow: 'hidden',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 10px',
            borderBottom: traceMinimized ? 'none' : '1px solid rgba(203, 213, 225, 0.7)',
            backgroundColor: 'rgba(248, 250, 252, 0.55)',
            fontSize: '11px',
            color: '#334155',
            fontWeight: 600,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Terminal size={13} />
            Agent Trace
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setTraceLogs([])}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px',
              }}
              title="Clear trace"
              aria-label="Clear trace"
            >
              <Trash2 size={12} />
            </button>
            <button
              onClick={() => setTraceMinimized((prev) => !prev)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px',
              }}
              title={traceMinimized ? 'Expand trace' : 'Minimize trace'}
              aria-label={traceMinimized ? 'Expand trace' : 'Minimize trace'}
            >
              {traceMinimized ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </span>
        </div>

        {!traceMinimized && (
          <div
            ref={traceBodyRef}
            style={{
              maxHeight: '154px',
              overflowY: 'auto',
              padding: '8px 10px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '11px',
              lineHeight: 1.5,
              color: '#334155',
            }}
          >
            {traceLogs.length === 0 ? (
              <div style={{ color: '#64748b' }}>No events yet.</div>
            ) : (
              traceLogs.map((entry) => (
                <div key={entry.id} style={{ marginBottom: '4px', color: traceColorMap[entry.type] || '#334155' }}>
                  <span style={{ opacity: 0.65, marginRight: '6px' }}>[{entry.timestamp}]</span>
                  <strong style={{ fontWeight: 600, marginRight: '6px' }}>{entry.type}</strong>
                  <span>{entry.text}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: '#ffffff',
          border: '1px solid #dbe3ee',
          borderRadius: '999px',
          padding: '6px 6px 6px 14px',
          boxShadow: '0 10px 25px rgba(15, 23, 42, 0.08)'
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={onChatKeyDown}
          placeholder="Ask Copilot..."
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '13px',
            color: '#1e293b'
          }}
        />
        <button
          onClick={sendCopilotMessage}
          disabled={isSending || !chatInput.trim()}
          style={{
            width: '34px',
            height: '34px',
            padding: 0,
            border: 'none',
            borderRadius: '999px',
            backgroundColor: isSending ? '#94a3b8' : '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isSending ? 'not-allowed' : 'pointer',
            flexShrink: 0,
            outline: 'none',
            lineHeight: 0
          }}
          aria-label="Send message to Copilot"
        >
          <ArrowRight size={17} strokeWidth={2.6} color="#ffffff" style={{ display: 'block' }} />
        </button>
      </div>
    </div>
  );
};

export default FloatingCopilotInput;
