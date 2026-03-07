import api from "./api";

export const scriptsImageApi = {
  generateCharacterImage: (characterId: number, payload: { model?: string; ratio?: string }) =>
    api.post(`/scripts/characters/${characterId}/generate-image`, payload),

  generateSceneImage: (sceneId: number, payload: { model?: string; ratio?: string }) =>
    api.post(`/scripts/scenes/${sceneId}/generate-image`, payload),

  generateAllCharacters: (scriptId: number, payload: { model?: string }) =>
    api.post(`/scripts/${scriptId}/generate-all-characters`, payload),

  generateAllScenes: (scriptId: number, payload: { model?: string }) =>
    api.post(`/scripts/${scriptId}/generate-all-scenes`, payload),
};
