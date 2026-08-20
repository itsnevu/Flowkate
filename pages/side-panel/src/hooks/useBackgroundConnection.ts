/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useRef } from 'react';
import { Actors } from '@extension/storage';
import { t } from '@extension/i18n';
import { EventType } from '../types/event';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Message } from '@extension/storage';
import type { AgentEvent } from '../types/event';

interface BackgroundConnectionProps {
  onExecutionEvent: (event: AgentEvent) => void;
  /** the port dropped: a running task will never report an outcome of its own, so close it out */
  onConnectionLost: () => void;
  appendMessage: (newMessage: Message, sessionId?: string | null) => void;
  setInputEnabled: Dispatch<SetStateAction<boolean>>;
  setShowStopButton: Dispatch<SetStateAction<boolean>>;
  setIsProcessingSpeech: Dispatch<SetStateAction<boolean>>;
  /** where the composer parks its setter, so a transcript can be dropped into the input */
  setInputTextRef: MutableRefObject<((text: string) => void) | null>;
}

/**
 * Owns the port to the background service worker: the single connection, its heartbeat and
 * the listener that fans incoming messages back out to the panel.
 *
 * The port lives in a ref rather than in state on purpose. Callers post to it directly and a
 * re-render must never tear it down, so nothing here is allowed to depend on render output.
 * Every input above is referentially stable, which keeps `setupConnection` stable too — the
 * listener it registers captures these callbacks exactly once per connection.
 */
export const useBackgroundConnection = ({
  onExecutionEvent,
  onConnectionLost,
  appendMessage,
  setInputEnabled,
  setShowStopButton,
  setIsProcessingSpeech,
  setInputTextRef,
}: BackgroundConnectionProps) => {
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);

  // Stop heartbeat and close connection
  const stopConnection = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (portRef.current) {
      portRef.current.disconnect();
      portRef.current = null;
    }
  }, []);

  // Setup connection management
  const setupConnection = useCallback(() => {
    // Only setup if no existing connection
    if (portRef.current) {
      return;
    }

    try {
      portRef.current = chrome.runtime.connect({ name: 'side-panel-connection' });

      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      portRef.current.onMessage.addListener((message: any) => {
        // Add type checking for message
        if (message && message.type === EventType.EXECUTION) {
          onExecutionEvent(message);
        } else if (message && message.type === 'error') {
          // Handle error messages from service worker
          appendMessage({
            actor: Actors.SYSTEM,
            content: message.error || t('errors_unknown'),
            timestamp: Date.now(),
          });
          setInputEnabled(true);
          setShowStopButton(false);
        } else if (message && message.type === 'success' && message.msg) {
          // Acknowledgements for the debug commands (/state, /nohighlight), which otherwise look
          // like they did nothing. Gated on `msg` on purpose: the control commands - approve_plan,
          // undo, pause - reply with a bare {type:'success'} and must stay silent, because their
          // result is already visible in the transcript.
          appendMessage({
            actor: Actors.SYSTEM,
            content: message.msg,
            timestamp: Date.now(),
          });
        } else if (message && message.type === 'speech_to_text_result') {
          // Handle speech-to-text result
          if (message.text && setInputTextRef.current) {
            setInputTextRef.current(message.text);
          }
          setIsProcessingSpeech(false);
        } else if (message && message.type === 'speech_to_text_error') {
          // Handle speech-to-text error
          appendMessage({
            actor: Actors.SYSTEM,
            content: message.error || t('chat_stt_recognitionFailed'),
            timestamp: Date.now(),
          });
          setIsProcessingSpeech(false);
        }
      });

      portRef.current.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.warn('Connection to the background worker dropped:', error.message);
        }
        portRef.current = null;
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        setInputEnabled(true);
        setShowStopButton(false);
        // The result and error messages that normally clear this both arrive over the port, so a
        // port that dropped mid-transcription leaves the mic button disabled behind a spinner with
        // nothing left to answer it.
        setIsProcessingSpeech(false);
        onConnectionLost();
      });

      // Setup heartbeat interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }

      heartbeatIntervalRef.current = window.setInterval(() => {
        if (portRef.current?.name === 'side-panel-connection') {
          try {
            portRef.current.postMessage({ type: 'heartbeat' });
          } catch (error) {
            console.error('Heartbeat failed:', error);
            stopConnection(); // Stop connection if heartbeat fails
          }
        } else {
          stopConnection(); // Stop if port is invalid
        }
      }, 25000);
    } catch (error) {
      console.error('Failed to establish connection:', error);
      appendMessage({
        actor: Actors.SYSTEM,
        content: t('errors_conn_serviceWorker'),
        timestamp: Date.now(),
      });
      // Clear any references since connection failed
      portRef.current = null;
    }
  }, [
    onExecutionEvent,
    onConnectionLost,
    appendMessage,
    stopConnection,
    setInputEnabled,
    setShowStopButton,
    setIsProcessingSpeech,
    setInputTextRef,
  ]);

  // Add safety check for message sending
  const sendMessage = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    (message: any) => {
      if (portRef.current?.name !== 'side-panel-connection') {
        throw new Error('No valid connection available');
      }
      try {
        portRef.current.postMessage(message);
      } catch (error) {
        console.error('Failed to send message:', error);
        stopConnection(); // Stop connection when message sending fails
        throw error;
      }
    },
    [stopConnection],
  );

  return { portRef, setupConnection, stopConnection, sendMessage };
};
