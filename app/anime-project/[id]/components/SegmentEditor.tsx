"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Loader2, 
  Play, 
  Wand2, 
  Image as ImageIcon, 
  Video, 
  Plus, 
  ArrowRight,
  User,
  MapPin,
  Box,
  Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetPicker } from "./AssetPicker";
import api from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { safeAsync } from "@/lib/error-handler";

interface SegmentEditorProps {
  projectId: number;
  segmentId?: number | null; // If editing an existing segment
  characters: any[];
  scenes: any[];
  props: any[];
  generatedVideos: any[]; // History
  onUpdate: () => void;
  onBack: () => void;
}

export default function SegmentEditor({
  projectId,
  segmentId,
  characters,
  scenes,
  props,
  generatedVideos,
  onUpdate,
  onBack
}: SegmentEditorProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState("fusion"); // fusion, img2vid, frame2frame
  const [generating, setGenerating] = useState(false);
  
  // Selection State
  const [selectedChar, setSelectedChar] = useState<any>(null);
  const [selectedScene, setSelectedScene] = useState<any>(null);
  const [selectedProp, setSelectedProp] = useState<any>(null);
  
  // Pickers Open State
  const [charPickerOpen, setCharPickerOpen] = useState(false);
  const [scenePickerOpen, setScenePickerOpen] = useState(false);
  const [propPickerOpen, setPropPickerOpen] = useState(false);

  // Form Data
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [startImage, setStartImage] = useState("");
  const [endImage, setEndImage] = useState("");

  const currentSegment = generatedVideos.find(v => v.id === segmentId);

  const handleGenerate = async () => {
    setGenerating(true);
    
    await safeAsync(
      async () => {
        const payload: any = {
          projectId,
          generationModel: "veo-3.1",
          duration,
          prompt,
        };

        if (mode === "fusion") {
          let fusionPrompt = prompt;
          if (selectedChar) fusionPrompt += `, Character: ${selectedChar.name}`;
          if (selectedScene) fusionPrompt += `, Scene: ${selectedScene.name}`;
          if (selectedProp) fusionPrompt += `, Prop: ${selectedProp.name}`;
          payload.motionPrompt = fusionPrompt;
          if (selectedChar?.imageUrl) payload.startImageUrl = selectedChar.imageUrl;
        } else if (mode === "img2vid") {
          if (!startImage) throw new Error("请上传或选择起始图片");
          payload.startImageUrl = startImage;
        } else if (mode === "frame2frame") {
          if (!startImage || !endImage) throw new Error("请上传起始帧和结束帧");
          payload.startImageUrl = startImage;
          payload.endImageUrl = endImage;
        }

        // 正确端点：/projects/:id/videos
        return await api.post(`/projects/${projectId}/videos`, payload);
      },
      toast,
      {
        successMessage: "🎬 视频生成任务已提交，正在处理中...",
        onSuccess: () => onUpdate()
      }
    );
    
    setGenerating(false);
  };

  return (
    <div className="flex h-full bg-zinc-950 text-white">
      {/* Left Panel: Creation */}
      <div className="w-[400px] border-r border-white/10 flex flex-col bg-zinc-900/50">
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowRight className="h-4 w-4 rotate-180" />
          </Button>
          <h2 className="font-semibold">分镜创作工坊</h2>
        </div>

        <Tabs value={mode} onValueChange={setMode} className="flex-1 flex flex-col">
          <TabsList className="grid grid-cols-3 m-4 bg-black/40">
            <TabsTrigger value="fusion">融合创作</TabsTrigger>
            <TabsTrigger value="img2vid">图生视频</TabsTrigger>
            <TabsTrigger value="frame2frame">首尾帧</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <TabsContent value="fusion" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400">选择素材 (点击更换)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {/* Character Slot */}
                    <div 
                      className={cn(
                        "aspect-[3/4] rounded-lg border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-purple-500/50 hover:bg-white/5 transition-all overflow-hidden relative",
                        selectedChar && "border-solid border-purple-500/50"
                      )}
                      onClick={() => setCharPickerOpen(true)}
                    >
                      {selectedChar ? (
                        <>
                          <img src={selectedChar.imageUrl} className="w-full h-full object-cover opacity-60" />
                          <div className="absolute inset-0 flex items-end p-2 bg-gradient-to-t from-black/80 to-transparent">
                            <span className="text-xs truncate w-full text-center">{selectedChar.name}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-2">
                          <User className="w-6 h-6 mx-auto mb-1 text-zinc-500" />
                          <span className="text-xs text-zinc-500">角色</span>
                        </div>
                      )}
                    </div>

                    {/* Scene Slot */}
                    <div 
                      className={cn(
                        "aspect-[3/4] rounded-lg border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/50 hover:bg-white/5 transition-all overflow-hidden relative",
                        selectedScene && "border-solid border-blue-500/50"
                      )}
                      onClick={() => setScenePickerOpen(true)}
                    >
                      {selectedScene ? (
                        <>
                          <img src={selectedScene.imageUrl} className="w-full h-full object-cover opacity-60" />
                          <div className="absolute inset-0 flex items-end p-2 bg-gradient-to-t from-black/80 to-transparent">
                            <span className="text-xs truncate w-full text-center">{selectedScene.name}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-2">
                          <MapPin className="w-6 h-6 mx-auto mb-1 text-zinc-500" />
                          <span className="text-xs text-zinc-500">场景</span>
                        </div>
                      )}
                    </div>

                    {/* Prop Slot */}
                    <div 
                      className={cn(
                        "aspect-[3/4] rounded-lg border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-yellow-500/50 hover:bg-white/5 transition-all overflow-hidden relative",
                        selectedProp && "border-solid border-yellow-500/50"
                      )}
                      onClick={() => setPropPickerOpen(true)}
                    >
                      {selectedProp ? (
                        <>
                          <img src={selectedProp.imageUrl} className="w-full h-full object-cover opacity-60" />
                          <div className="absolute inset-0 flex items-end p-2 bg-gradient-to-t from-black/80 to-transparent">
                            <span className="text-xs truncate w-full text-center">{selectedProp.name}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-2">
                          <Box className="w-6 h-6 mx-auto mb-1 text-zinc-500" />
                          <span className="text-xs text-zinc-500">物品</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>画面/剧情描述</Label>
                  <Textarea 
                    placeholder="描述角色在这个场景中正在做什么，以及镜头的运动方式..."
                    className="min-h-[120px] bg-black/50 border-white/10 resize-none"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="img2vid" className="space-y-6 mt-0">
               <div className="space-y-2">
                  <Label>起始图片 URL</Label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="https://..." 
                      value={startImage}
                      onChange={(e) => setStartImage(e.target.value)}
                      className="bg-black/50 border-white/10"
                    />
                    <Button variant="outline" size="icon" className="border-white/10 shrink-0">
                      <ImageIcon className="w-4 h-4" />
                    </Button>
                  </div>
                  {startImage && (
                    <div className="aspect-video rounded-lg overflow-hidden border border-white/10 bg-black">
                      <img src={startImage} className="w-full h-full object-contain" />
                    </div>
                  )}
               </div>
               <div className="space-y-2">
                  <Label>动态描述</Label>
                  <Textarea 
                    placeholder="描述图片应该如何动起来..."
                    className="min-h-[100px] bg-black/50 border-white/10"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
               </div>
            </TabsContent>

            <TabsContent value="frame2frame" className="space-y-6 mt-0">
               <div className="space-y-4">
                 <div className="space-y-2">
                    <Label>起始帧 URL</Label>
                    <Input 
                      value={startImage}
                      onChange={(e) => setStartImage(e.target.value)}
                      className="bg-black/50 border-white/10"
                    />
                 </div>
                 <div className="space-y-2">
                    <Label>结束帧 URL</Label>
                    <Input 
                      value={endImage}
                      onChange={(e) => setEndImage(e.target.value)}
                      className="bg-black/50 border-white/10"
                    />
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                    <div className="aspect-video bg-black/50 rounded border border-white/10 flex items-center justify-center text-xs text-zinc-500">
                      {startImage ? <img src={startImage} className="w-full h-full object-cover" /> : "Start"}
                    </div>
                    <div className="aspect-video bg-black/50 rounded border border-white/10 flex items-center justify-center text-xs text-zinc-500">
                      {endImage ? <img src={endImage} className="w-full h-full object-cover" /> : "End"}
                    </div>
                 </div>
               </div>
            </TabsContent>
          </div>

          <div className="p-4 border-t border-white/10 space-y-4 bg-zinc-900">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">生成时长 (秒)</span>
                <span>{duration}s</span>
              </div>
              <div className="flex items-center gap-4">
                <Input 
                  type="number" 
                  min={2} 
                  max={10} 
                  value={duration} 
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="bg-black/50 border-white/10"
                />
                <div className="flex gap-1">
                   {[3, 5, 8, 10].map(val => (
                     <Button 
                       key={val} 
                       size="sm" 
                       variant={duration === val ? "default" : "outline"}
                       onClick={() => setDuration(val)}
                       className={duration === val ? "bg-purple-600 border-0" : "border-white/10 bg-transparent"}
                     >
                       {val}s
                     </Button>
                   ))}
                </div>
              </div>
            </div>
            <Button 
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 h-12 text-lg font-medium"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5 mr-2" />
                  开始生成视频
                </>
              )}
            </Button>
          </div>
        </Tabs>
      </div>

      {/* Right Panel: Preview & History */}
      <div className="flex-1 bg-black flex flex-col min-w-0">
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
           {/* Main Preview Area */}
           {currentSegment?.videoUrl ? (
             <div className="w-full max-w-4xl aspect-video bg-zinc-900 rounded-xl overflow-hidden shadow-2xl border border-white/10 relative group">
               <video 
                  src={currentSegment.videoUrl} 
                  controls 
                  autoPlay 
                  loop 
                  className="w-full h-full bg-black" 
               />
             </div>
           ) : currentSegment?.status === 'GENERATING' ? (
             <div className="flex flex-col items-center gap-4">
               <div className="w-16 h-16 rounded-full border-4 border-zinc-800 border-t-purple-500 animate-spin" />
               <p className="text-purple-400 animate-pulse">AI 正在绘制您的分镜...</p>
               <p className="text-zinc-500 text-sm">预计耗时 1-3 分钟</p>
             </div>
           ) : (
             <div className="text-center space-y-4 max-w-md">
               <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6">
                 <Video className="w-10 h-10 text-zinc-700" />
               </div>
               <h3 className="text-xl font-medium text-zinc-300">准备创作</h3>
               <p className="text-zinc-500">在左侧配置您的镜头参数，点击生成开始创作。融合模式下，AI将根据您选择的角色和场景自动构图。</p>
             </div>
           )}

           {/* Overlay Info */}
           {currentSegment && (
             <div className="absolute top-6 left-8">
               <h1 className="text-2xl font-bold drop-shadow-md">{currentSegment.name}</h1>
               <p className="text-white/70 text-sm drop-shadow-md mt-1">{currentSegment.description}</p>
             </div>
           )}
        </div>

        {/* History Strip */}
        <div className="h-48 bg-zinc-900/50 border-t border-white/10 flex flex-col">
          <div className="px-6 py-3 border-b border-white/5 flex justify-between items-center">
             <span className="text-sm font-medium text-zinc-400">历史生成记录</span>
             <span className="text-xs text-zinc-600">{generatedVideos.length} 个版本</span>
          </div>
          <div className="flex-1 overflow-x-auto p-4 flex gap-4">
            {generatedVideos.map((video) => (
              <div 
                key={video.id} 
                className={cn(
                  "flex-shrink-0 w-64 aspect-video bg-black rounded-lg border cursor-pointer relative group overflow-hidden transition-all",
                  currentSegment?.id === video.id ? "border-purple-500 ring-1 ring-purple-500" : "border-white/10 hover:border-white/30"
                )}
                // We actually want to switch the 'view', but since we are editing a segment, 
                // maybe clicking history just previews it? 
                // For now let's say it does nothing or creates a new tab?
                // Or simplified: This list IS the Segment List, and clicking one makes it the 'current' one being edited.
                // But the parent passes 'segmentId'. So we need onSelect prop if we want to switch.
                // Let's assume for now this is just a display list.
              >
                {video.videoUrl ? (
                   <video src={video.videoUrl} className="w-full h-full object-cover" />
                ) : (
                   <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600">
                     {video.status === 'GENERATING' ? <Loader2 className="animate-spin" /> : <Video />}
                   </div>
                )}
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs text-white truncate">{video.name}</p>
                  <p className="text-[10px] text-zinc-400">{video.status}</p>
                </div>
              </div>
            ))}
            
            {/* Create New Placeholder */}
             <div 
                className="flex-shrink-0 w-32 bg-white/5 rounded-lg border border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 text-zinc-500 hover:text-white transition-colors"
                onClick={onBack} // Go back to create new
             >
                <Plus className="w-6 h-6 mb-2" />
                <span className="text-xs">新建分镜</span>
             </div>
          </div>
        </div>
      </div>

      {/* Asset Pickers */}
      <Dialog open={charPickerOpen} onOpenChange={setCharPickerOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-4xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b border-white/10">
            <DialogTitle>选择角色</DialogTitle>
          </DialogHeader>
          <AssetPicker
            type="char"
            characters={characters}
            scenes={scenes}
            props={props}
            onSelect={(asset) => {
              setSelectedChar(asset);
              setCharPickerOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={scenePickerOpen} onOpenChange={setScenePickerOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-4xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b border-white/10">
            <DialogTitle>选择场景</DialogTitle>
          </DialogHeader>
          <AssetPicker
            type="scene"
            characters={characters}
            scenes={scenes}
            props={props}
            onSelect={(asset) => {
              setSelectedScene(asset);
              setScenePickerOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={propPickerOpen} onOpenChange={setPropPickerOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-4xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b border-white/10">
            <DialogTitle>选择物品</DialogTitle>
          </DialogHeader>
          <AssetPicker
            type="prop"
            characters={characters}
            scenes={scenes}
            props={props}
            onSelect={(asset) => {
              setSelectedProp(asset);
              setPropPickerOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
