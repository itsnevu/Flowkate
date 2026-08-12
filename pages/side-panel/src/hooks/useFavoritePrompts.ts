import { useState, useEffect } from 'react';
import favoritesStorage from '@extension/storage/lib/prompt/favorites';
import type { FavoritePrompt } from '@extension/storage/lib/prompt/favorites';

/**
 * The pinned prompts strip. Storage stays the single source of truth: every mutation is
 * followed by a re-read rather than a local splice, so the list always reflects the order
 * and ids storage actually settled on (reordering in particular renumbers entries).
 *
 * `addPrompt` deliberately does not catch: pinning is initiated from a caller that already
 * reports its own failure, and swallowing here would let that caller continue as if it worked.
 */
export const useFavoritePrompts = () => {
  const [favoritePrompts, setFavoritePrompts] = useState<FavoritePrompt[]>([]);

  // Load favorite prompts from storage
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const prompts = await favoritesStorage.getAllPrompts();
        setFavoritePrompts(prompts);
      } catch (error) {
        console.error('Failed to load favorite prompts:', error);
      }
    };

    loadFavorites();
  }, []);

  const addPrompt = async (title: string, content: string) => {
    // Add to favorites storage
    await favoritesStorage.addPrompt(title, content);

    // Update favorites in the UI
    const prompts = await favoritesStorage.getAllPrompts();
    setFavoritePrompts(prompts);
  };

  const updatePromptTitle = async (id: number, title: string) => {
    try {
      await favoritesStorage.updatePromptTitle(id, title);

      // Update favorites in the UI
      const prompts = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(prompts);
    } catch (error) {
      console.error('Failed to update favorite prompt title:', error);
    }
  };

  const removePrompt = async (id: number) => {
    try {
      await favoritesStorage.removePrompt(id);

      // Update favorites in the UI
      const prompts = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(prompts);
    } catch (error) {
      console.error('Failed to delete favorite prompt:', error);
    }
  };

  const reorderPrompts = async (draggedId: number, targetId: number) => {
    try {
      // Directly pass IDs to storage function - it now handles the reordering logic
      await favoritesStorage.reorderPrompts(draggedId, targetId);

      // Fetch the updated list from storage to get the new IDs and reflect the authoritative order
      const updatedPromptsFromStorage = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(updatedPromptsFromStorage);
    } catch (error) {
      console.error('Failed to reorder favorite prompts:', error);
    }
  };

  return { favoritePrompts, addPrompt, updatePromptTitle, removePrompt, reorderPrompts };
};
