const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export interface ApiResponse {
  content: unknown;
  current_stage: string;
  follow_up_question?: string;
}

// Single Unified Chat Endpoint
export const sendMessage = async (
  sessionId: string,
  message: string,
  history: { role: string; content: string }[] = [],
  file?: File,
  developerProfile?: string
): Promise<ApiResponse> => {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append("user_input", message);
  formData.append("history", JSON.stringify(history));

  if (developerProfile) {
    formData.append("developer_profile", developerProfile);
  }

  if (file) {
    formData.append("file", file);
  }

  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      detail: `Request failed with status: ${response.status}`,
    }));
    throw new Error(error.detail);
  }

  return await response.json();
};

// GET /
export const checkHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch (error) {
    console.error("Health check failed:", error);
    return false;
  }
};
