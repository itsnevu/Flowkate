import { useEffect, useState } from 'react';
import { speechToTextModelStore } from '@extension/storage';

/**
 * The transcription model, held as `provider>model` to match the dropdown's option values
 * and split back apart only when it is written to storage.
 */
export const useSpeechToTextConfig = () => {
  const [selectedSpeechToTextModel, setSelectedSpeechToTextModel] = useState<string>('');

  useEffect(() => {
    const loadSpeechToTextModel = async () => {
      try {
        const config = await speechToTextModelStore.getSpeechToTextModel();
        if (config) {
          setSelectedSpeechToTextModel(`${config.provider}>${config.modelName}`);
        }
      } catch (error) {
        console.error('Error loading speech-to-text model:', error);
      }
    };

    loadSpeechToTextModel();
  }, []);

  const handleSpeechToTextModelChange = async (modelValue: string) => {
    setSelectedSpeechToTextModel(modelValue);

    try {
      if (modelValue) {
        // Parse the "provider>model" format
        const [provider, modelName] = modelValue.split('>');

        // Save to proper storage
        await speechToTextModelStore.setSpeechToTextModel({
          provider,
          modelName,
        });
      } else {
        // Reset if no model selected
        await speechToTextModelStore.resetSpeechToTextModel();
      }
    } catch (error) {
      console.error('Error saving speech-to-text model:', error);
    }
  };

  return { selectedSpeechToTextModel, handleSpeechToTextModelChange };
};
