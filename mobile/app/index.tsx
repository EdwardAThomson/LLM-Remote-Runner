import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { TaskStreamEvent } from '@codex/sdk';
import { createTask } from '../lib/sdk';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  content: {
    padding: 24,
    flexGrow: 1,
    gap: 24,
  },
  heading: {
    fontSize: 24,
    fontWeight: '600',
  },
  description: {
    fontSize: 16,
    color: '#555',
  },
  textarea: {
    minHeight: 160,
    borderRadius: 12,
    borderColor: '#ccc',
    borderWidth: 1,
    padding: 16,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#111',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  errorBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f88',
    backgroundColor: '#ffecec',
    padding: 12,
    color: '#a40000',
  },
  streamCard: {
    borderRadius: 12,
    borderColor: '#ddd',
    borderWidth: 1,
    backgroundColor: '#fff',
    padding: 16,
    gap: 8,
  },
  streamItem: {
    fontFamily: 'Courier',
    fontSize: 14,
  },
  streamInfo: {
    color: '#444',
  },
  streamError: {
    color: '#b40000',
  },
  streamStatus: {
    color: '#0b5fff',
  },
  streamDone: {
    color: '#0b8f24',
  },
});

type ConsoleEntry = TaskStreamEvent | { type: 'info'; message: string };

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      setError('Prompt is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setEntries([{ type: 'info', message: 'Creating task…' }]);

    try {
      const task = await createTask({ prompt: prompt.trim() });
      setEntries((prev) => [
        ...prev,
        { type: 'info', message: `Task ${task.task_id} created.` },
        {
          type: 'info',
          message:
            'Streaming is not wired up yet. Integrate an EventSource polyfill to receive live updates.',
        },
      ]);
      setPrompt('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setEntries([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.heading}>Codex Remote Runner</Text>
          <Text style={styles.description}>
            Submit prompts to the Codex gateway and review output from your phone.
          </Text>
        </View>

        <View>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            style={styles.textarea}
            multiline
            editable={!isSubmitting}
            placeholder="Describe the task for Codex"
          />
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={styles.button}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>
              {isSubmitting ? 'Submitting…' : 'Run Task'}
            </Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

        <View style={styles.streamCard}>
          {entries.length === 0 ? (
            <Text style={styles.streamInfo}>No output yet.</Text>
          ) : (
            entries.map((entry, index) => {
              if (entry.type === 'info') {
                return (
                  <Text key={index} style={styles.streamInfo}>
                    {entry.message}
                  </Text>
                );
              }

              if (entry.type === 'log') {
                return (
                  <Text
                    key={index}
                    style={
                      entry.data.stream === 'stderr'
                        ? [styles.streamItem, styles.streamError]
                        : styles.streamItem
                    }
                  >
                    {entry.data.line}
                  </Text>
                );
              }

              if (entry.type === 'status') {
                return (
                  <Text key={index} style={[styles.streamItem, styles.streamStatus]}>
                    Status: {entry.data.state}
                    {entry.data.error ? ` – ${entry.data.error}` : ''}
                  </Text>
                );
              }

              if (entry.type === 'done') {
                return (
                  <Text key={index} style={[styles.streamItem, styles.streamDone]}>
                    Exit code: {entry.data.exit_code}
                  </Text>
                );
              }

              return null;
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
