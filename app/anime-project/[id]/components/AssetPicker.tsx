import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, MapPin, Box, Search, Upload, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AssetPickerProps {
  type: "char" | "scene" | "prop" | "refImage" | "endImage";
  characters: any[];
  scenes: any[];
  props: any[];
  onSelect: (asset: any) => void;
}

export function AssetPicker({ type, characters, scenes, props, onSelect }: AssetPickerProps) {
  // Determine default tab based on requested type, but allow switching
  const [activeTab, setActiveTab] = useState(() => {
     if (type === 'char') return 'characters';
     if (type === 'scene') return 'scenes';
     if (type === 'prop') return 'props';
     return 'characters';
  });

  const [search, setSearch] = useState("");

  const getActiveList = () => {
    switch (activeTab) {
      case 'characters': return characters;
      case 'scenes': return scenes;
      case 'props': return props;
      default: return [];
    }
  };

  const filteredItems = getActiveList().filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-zinc-950">
       <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-black/20">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
             <TabsList className="bg-zinc-900 border border-white/10">
                <TabsTrigger value="characters" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">角色</TabsTrigger>
                <TabsTrigger value="scenes" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">场景</TabsTrigger>
                <TabsTrigger value="props" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">物品</TabsTrigger>
             </TabsList>
          </Tabs>
          
          <div className="flex items-center gap-2">
             <div className="relative">
               <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
               <Input 
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 placeholder="搜索素材..." 
                 className="h-8 w-48 pl-8 bg-zinc-900 border-white/10 text-xs"
               />
             </div>
             <Button size="sm" variant="outline" className="h-8 text-xs border-white/10">
               <Upload className="h-3 w-3 mr-1" /> 上传
             </Button>
          </div>
       </div>
       
       <div className="flex-1 overflow-y-auto p-6 bg-black/50">
          <div className="grid grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredItems.map((item) => (
              <div 
                key={item.id} 
                className="group relative aspect-square bg-zinc-900 border border-white/10 rounded-xl overflow-hidden cursor-pointer hover:border-purple-500 hover:shadow-lg hover:shadow-purple-900/20 transition-all"
                onClick={() => onSelect(item)}
              >
                {item.imageUrl || item.profilePictureUrl ? (
                  <img src={item.imageUrl || item.profilePictureUrl} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600">
                     {activeTab === 'characters' && <User className="h-8 w-8" />}
                     {activeTab === 'scenes' && <MapPin className="h-8 w-8" />}
                     {activeTab === 'props' && <Box className="h-8 w-8" />}
                  </div>
                )}
                
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-8 opacity-100 transition-opacity">
                  <p className="text-xs font-medium text-white truncate">{item.name}</p>
                </div>
                
                {/* Selection Overlay */}
                <div className="absolute inset-0 bg-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                   <div className="bg-purple-600 rounded-full p-2 shadow-lg scale-0 group-hover:scale-100 transition-transform">
                      <Check className="h-4 w-4 text-white" />
                   </div>
                </div>
              </div>
            ))}
            
            {filteredItems.length === 0 && (
               <div className="col-span-full py-20 text-center text-zinc-500 flex flex-col items-center">
                  <Search className="h-10 w-10 mb-2 opacity-20" />
                  <p>未找到匹配素材</p>
               </div>
            )}
          </div>
       </div>
    </div>
  );
}
