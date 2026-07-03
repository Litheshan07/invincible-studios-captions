import { useState, useCallback } from "react";

interface Word {
  word: string;
  start_time: number;
  end_time: number;
  confidence: number;
  is_emphasized?: boolean;
  is_punchline?: boolean;
}

interface Segment {
  id: string;
  speaker_id: string;
  start_time: number;
  end_time: number;
  text: string;
  tamil_text?: string;
  tanglish_text?: string;
  english_text?: string;
  words: Word[];
  xOffset?: number;
  yOffset?: number;
}

export function useUndoHistory(initialState: Segment[]) {
  const [history, setHistory] = useState<Segment[][]>([JSON.parse(JSON.stringify(initialState))]);
  const [index, setIndex] = useState<number>(0);

  const pushState = useCallback((newState: Segment[]) => {
    const stateCopy = JSON.parse(JSON.stringify(newState));
    setHistory((prev) => {
      const nextHistory = prev.slice(0, index + 1);
      const sliced = nextHistory.length > 50 ? nextHistory.slice(nextHistory.length - 50) : nextHistory;
      return [...sliced, stateCopy];
    });
    setIndex((prev) => {
      const nextIdx = prev + 1;
      return nextIdx > 49 ? 49 : nextIdx;
    });
  }, [index]);

  const undo = useCallback((): Segment[] | null => {
    if (index > 0) {
      const nextIndex = index - 1;
      setIndex(nextIndex);
      return JSON.parse(JSON.stringify(history[nextIndex]));
    }
    return null;
  }, [index, history]);

  const redo = useCallback((): Segment[] | null => {
    if (index < history.length - 1) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      return JSON.parse(JSON.stringify(history[nextIndex]));
    }
    return null;
  }, [index, history]);

  const resetHistory = useCallback((state: Segment[]) => {
    const stateCopy = JSON.parse(JSON.stringify(state));
    setHistory([stateCopy]);
    setIndex(0);
  }, []);

  return {
    pushState,
    undo,
    redo,
    resetHistory,
    canUndo: index > 0,
    canRedo: index < history.length - 1
  };
}
