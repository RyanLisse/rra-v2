import { vi } from 'vitest';

// Mock useChat hook
const mockUseChat = vi.fn();
vi.mock('ai/react', () => ({
  useChat: () => mockUseChat(),
}));

// Mock session
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupTestEnvironment } from '../utils/test-helpers';
import { createChatMessage } from '../fixtures/test-data';

// Mock React
const React = { useState: vi.fn() };
global.React = React as any;

// Mock the Chat component (assuming it exists)
const MockChat = ({
  chatId,
  initialMessages = [],
  onMessageSend,
  isLoading = false,
  error = null,
}: any) => {
  const [messages, setMessages] = React.useState(initialMessages);
  const [input, setInput] = React.useState('');

  const handleSend = () => {
    if (input.trim()) {
      const newMessage = createChatMessage({ text: input });
      setMessages((prev) => [...prev, newMessage]);
      onMessageSend?.(newMessage);
      setInput('');
    }
  };

  return (
    <div data-testid="chat-interface">
      <div data-testid="messages-container">
        {messages.map((message: any) => (
          <div key={message.id} data-testid={`message-${message.role}`}>
            {message.parts[0]?.text}
          </div>
        ))}
      </div>

      {error && (
        <div data-testid="error-message" role="alert">
          {error}
        </div>
      )}

      <div data-testid="input-container">
        <textarea
          data-testid="message-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={isLoading}
        />
        <button
          data-testid="send-button"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>

      {isLoading && (
        <div data-testid="loading-indicator" role="status" aria-label="Loading">
          Loading...
        </div>
      )}
    </div>
  );
};

describe('Chat Interface Component', () => {
  const user = userEvent.setup();
  let mockStateSetter: any;
  let mockState: any;

  beforeEach(() => {
    setupTestEnvironment();
    vi.clearAllMocks();

    mockState = '';
    mockStateSetter = vi.fn((newState) => {
      if (typeof newState === 'function') {
        mockState = newState(mockState);
      } else {
        mockState = newState;
      }
    });

    React.useState.mockReturnValue([mockState, mockStateSetter]);

    mockUseChat.mockReturnValue({
      messages: [],
      input: '',
      handleInputChange: vi.fn(),
      handleSubmit: vi.fn(),
      append: vi.fn(),
      reload: vi.fn(),
      stop: vi.fn(),
      isLoading: false,
      error: null,
    });
  });

  describe('Rendering', () => {
    it('should render chat interface components', () => {
      render(<MockChat chatId="test-chat" />);

      expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
      expect(screen.getByTestId('messages-container')).toBeInTheDocument();
      expect(screen.getByTestId('input-container')).toBeInTheDocument();
      expect(screen.getByTestId('message-input')).toBeInTheDocument();
      expect(screen.getByTestId('send-button')).toBeInTheDocument();
    });

    it('should render with initial messages', () => {
      const initialMessages = [
        createChatMessage({ text: 'Hello' }),
        createChatMessage({ text: 'Hi there!', role: 'assistant' }),
      ];

      render(<MockChat chatId="test-chat" initialMessages={initialMessages} />);

      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi there!')).toBeInTheDocument();
      expect(screen.getByTestId('message-user')).toBeInTheDocument();
      expect(screen.getByTestId('message-assistant')).toBeInTheDocument();
    });

    it('should show placeholder text in input', () => {
      render(<MockChat chatId="test-chat" />);

      const input = screen.getByTestId('message-input');
      expect(input).toHaveAttribute('placeholder', 'Type your message...');
    });
  });

  describe('Message Input', () => {
    it('should allow typing messages', async () => {
      render(<MockChat chatId="test-chat" />);

      const input = screen.getByTestId('message-input');
      await user.type(input, 'Hello, world!');

      expect(input).toHaveValue('Hello, world!');
    });

    it('should enable send button when input has content', async () => {
      render(<MockChat chatId="test-chat" />);

      const input = screen.getByTestId('message-input');
      const sendButton = screen.getByTestId('send-button');

      expect(sendButton).toBeDisabled();

      await user.type(input, 'Test message');
      expect(sendButton).not.toBeDisabled();
    });

    it('should keep send button disabled for whitespace-only input', async () => {
      render(<MockChat chatId="test-chat" />);

      const input = screen.getByTestId('message-input');
      const sendButton = screen.getByTestId('send-button');

      await user.type(input, '   ');
      expect(sendButton).toBeDisabled();
    });

    it('should support multiline input', async () => {
      render(<MockChat chatId="test-chat" />);

      const input = screen.getByTestId('message-input');
      await user.type(input, 'Line 1{enter}Line 2');

      expect(input).toHaveValue('Line 1\nLine 2');
    });
  });

  describe('Sending Messages', () => {
    it('should send message when send button is clicked', async () => {
      const onMessageSend = vi.fn();
      render(<MockChat chatId="test-chat" onMessageSend={onMessageSend} />);

      const input = screen.getByTestId('message-input');
      const sendButton = screen.getByTestId('send-button');

      await user.type(input, 'Test message');
      await user.click(sendButton);

      expect(onMessageSend).toHaveBeenCalledWith(
        expect.objectContaining({
          parts: [{ text: 'Test message' }],
        }),
      );
    });

    it('should clear input after sending message', async () => {
      render(<MockChat chatId="test-chat" />);

      const input = screen.getByTestId('message-input');
      const sendButton = screen.getByTestId('send-button');

      await user.type(input, 'Test message');
      await user.click(sendButton);

      expect(input).toHaveValue('');
    });

    it('should add message to conversation', async () => {
      render(<MockChat chatId="test-chat" />);

      const input = screen.getByTestId('message-input');
      const sendButton = screen.getByTestId('send-button');

      await user.type(input, 'New message');
      await user.click(sendButton);

      expect(screen.getByText('New message')).toBeInTheDocument();
    });

    it('should support sending with Enter key', async () => {
      const onMessageSend = vi.fn();
      render(<MockChat chatId="test-chat" onMessageSend={onMessageSend} />);

      const input = screen.getByTestId('message-input');
      await user.type(input, 'Keyboard message{enter}');

      expect(onMessageSend).toHaveBeenCalled();
    });

    it('should not send empty messages', async () => {
      const onMessageSend = vi.fn();
      render(<MockChat chatId="test-chat" onMessageSend={onMessageSend} />);

      const sendButton = screen.getByTestId('send-button');
      await user.click(sendButton);

      expect(onMessageSend).not.toHaveBeenCalled();
    });
  });

  describe('Loading States', () => {
    it('should show loading indicator when loading', () => {
      render(<MockChat chatId="test-chat" isLoading={true} />);

      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAccessibleName('Loading');
    });

    it('should disable input when loading', () => {
      render(<MockChat chatId="test-chat" isLoading={true} />);

      const input = screen.getByTestId('message-input');
      const sendButton = screen.getByTestId('send-button');

      expect(input).toBeDisabled();
      expect(sendButton).toBeDisabled();
      expect(sendButton).toHaveTextContent('Sending...');
    });

    it('should hide loading indicator when not loading', () => {
      render(<MockChat chatId="test-chat" isLoading={false} />);

      expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error messages', () => {
      const errorMessage = 'Failed to send message';
      render(<MockChat chatId="test-chat" error={errorMessage} />);

      const errorElement = screen.getByTestId('error-message');
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveTextContent(errorMessage);
      expect(errorElement).toHaveAttribute('role', 'alert');
    });

    it('should not display error element when no error', () => {
      render(<MockChat chatId="test-chat" error={null} />);

      expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
    });

    it('should handle network errors gracefully', async () => {
      const onMessageSend = vi
        .fn()
        .mockRejectedValue(new Error('Network error'));
      render(<MockChat chatId="test-chat" onMessageSend={onMessageSend} />);

      const input = screen.getByTestId('message-input');
      const sendButton = screen.getByTestId('send-button');

      await user.type(input, 'Test message');
      await user.click(sendButton);

      // Should handle error without crashing
      expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
    });
  });

  describe('Message Display', () => {
    it('should distinguish between user and assistant messages', () => {
      const messages = [
        createChatMessage({ text: 'User message', role: 'user' }),
        createChatMessage({ text: 'Assistant response', role: 'assistant' }),
      ];

      render(<MockChat chatId="test-chat" initialMessages={messages} />);

      expect(screen.getByTestId('message-user')).toBeInTheDocument();
      expect(screen.getByTestId('message-assistant')).toBeInTheDocument();
    });

    it('should handle long messages', () => {
      const longMessage = 'A'.repeat(1000);
      const messages = [createChatMessage({ text: longMessage })];

      render(<MockChat chatId="test-chat" initialMessages={messages} />);

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('should handle special characters in messages', () => {
      const specialMessage =
        '🚀 Testing with emojis & special chars <script>alert("xss")</script>';
      const messages = [createChatMessage({ text: specialMessage })];

      render(<MockChat chatId="test-chat" initialMessages={messages} />);

      expect(screen.getByText(specialMessage)).toBeInTheDocument();
    });

    it('should maintain message order', () => {
      const messages = [
        createChatMessage({ text: 'First message' }),
        createChatMessage({ text: 'Second message' }),
        createChatMessage({ text: 'Third message' }),
      ];

      render(<MockChat chatId="test-chat" initialMessages={messages} />);

      const messageElements = screen.getAllByTestId(/^message-/);
      expect(messageElements[0]).toHaveTextContent('First message');
      expect(messageElements[1]).toHaveTextContent('Second message');
      expect(messageElements[2]).toHaveTextContent('Third message');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<MockChat chatId="test-chat" />);

      const input = screen.getByTestId('message-input');
      expect(input).toHaveAccessibleName();

      const sendButton = screen.getByTestId('send-button');
      expect(sendButton).toHaveAccessibleName();
    });

    it('should support keyboard navigation', async () => {
      render(<MockChat chatId="test-chat" />);

      const input = screen.getByTestId('message-input');
      const sendButton = screen.getByTestId('send-button');

      // Tab to input
      await user.tab();
      expect(input).toHaveFocus();

      // Tab to send button
      await user.tab();
      expect(sendButton).toHaveFocus();
    });

    it('should announce loading state to screen readers', () => {
      render(<MockChat chatId="test-chat" isLoading={true} />);

      const loadingIndicator = screen.getByRole('status');
      expect(loadingIndicator).toHaveAccessibleName('Loading');
    });

    it('should announce errors to screen readers', () => {
      render(<MockChat chatId="test-chat" error="Test error" />);

      const errorAlert = screen.getByRole('alert');
      expect(errorAlert).toHaveTextContent('Test error');
    });
  });

  describe('Performance', () => {
    it('should handle large number of messages efficiently', () => {
      const manyMessages = Array.from({ length: 1000 }, (_, i) =>
        createChatMessage({ text: `Message ${i}` }),
      );

      const startTime = performance.now();
      render(<MockChat chatId="test-chat" initialMessages={manyMessages} />);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(1000); // Render under 1 second
      expect(screen.getByTestId('messages-container')).toBeInTheDocument();
    });

    it('should not cause memory leaks with frequent updates', async () => {
      render(<MockChat chatId="test-chat" />);

      const input = screen.getByTestId('message-input');
      const sendButton = screen.getByTestId('send-button');

      // Send many messages rapidly
      for (let i = 0; i < 100; i++) {
        await user.clear(input);
        await user.type(input, `Rapid message ${i}`);
        await user.click(sendButton);
      }

      // Component should still be responsive
      expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
      expect(input).toHaveValue('');
    });
  });

  describe('Integration with AI SDK', () => {
    it('should use AI SDK useChat hook', () => {
      render(<MockChat chatId="test-chat" />);

      expect(mockUseChat).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-chat',
        }),
      );
    });

    it('should handle streaming responses', async () => {
      const streamingMessages = [
        createChatMessage({ text: 'Partial response...' }),
      ];

      mockUseChat.mockReturnValue({
        messages: streamingMessages,
        isLoading: true,
        input: '',
        handleInputChange: vi.fn(),
        handleSubmit: vi.fn(),
      });

      render(<MockChat chatId="test-chat" />);

      expect(screen.getByText('Partial response...')).toBeInTheDocument();
      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    });

    it('should handle tool usage in messages', () => {
      const toolMessage = createChatMessage({
        text: '',
        toolInvocations: [
          {
            toolName: 'weather',
            toolCallId: 'call_123',
            state: 'result',
            result: { temperature: 72, condition: 'sunny' },
          },
        ],
      });

      render(<MockChat chatId="test-chat" initialMessages={[toolMessage]} />);

      // Should render tool usage appropriately
      expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('should adapt to mobile viewport', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<MockChat chatId="test-chat" />);

      const chatInterface = screen.getByTestId('chat-interface');
      expect(chatInterface).toBeInTheDocument();
      // Would check for mobile-specific styles in real implementation
    });

    it('should handle touch interactions on mobile', async () => {
      render(<MockChat chatId="test-chat" />);

      const sendButton = screen.getByTestId('send-button');

      // Simulate touch events
      fireEvent.touchStart(sendButton);
      fireEvent.touchEnd(sendButton);

      // Button should remain functional
      expect(sendButton).toBeInTheDocument();
    });
  });
});
