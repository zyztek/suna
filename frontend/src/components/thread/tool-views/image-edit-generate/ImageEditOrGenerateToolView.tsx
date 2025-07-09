'use client'

import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  Sparkles,
  Wand2,
  CheckCircle,
  AlertTriangle,
  Loader2,
  ImageOff,
  Download,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ToolViewProps } from '../types';
import { formatTimestamp, getToolTitle, extractToolData } from '../utils';
import { cn, truncateString } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingState } from '../shared/LoadingState';
import { GenericToolView } from '../GenericToolView';
import { useAuth } from '@/components/AuthProvider';

interface ImageGenerationData {
  mode: 'generate' | 'edit';
  prompt: string;
  image_path?: string;
  size?: string;
  output?: string;
  success?: boolean;
  generatedImagePath?: string;
}

function extractImageGenerationData(
  assistantContent: any,
  toolContent: any,
  isSuccess: boolean
): ImageGenerationData {
  let data: Partial<ImageGenerationData> = {};
  
  if (assistantContent) {
    try {
      let parsedAssistant = assistantContent;
      if (typeof assistantContent === 'string') {
        parsedAssistant = JSON.parse(assistantContent);
      }
      
      if (parsedAssistant.parameters) {
        data.mode = parsedAssistant.parameters.mode;
        data.prompt = parsedAssistant.parameters.prompt;
        data.image_path = parsedAssistant.parameters.image_path;
        data.size = parsedAssistant.parameters.size;
      }
    } catch (e) {
      if (typeof assistantContent === 'string') {
        const modeMatch = assistantContent.match(/"mode":\s*"([^"]+)"/);
        const promptMatch = assistantContent.match(/"prompt":\s*"([^"]+)"/);
        const imagePathMatch = assistantContent.match(/"image_path":\s*"([^"]+)"/);
        const sizeMatch = assistantContent.match(/"size":\s*"([^"]+)"/);
        
        if (modeMatch) data.mode = modeMatch[1] as 'generate' | 'edit';
        if (promptMatch) data.prompt = promptMatch[1];
        if (imagePathMatch) data.image_path = imagePathMatch[1];
        if (sizeMatch) data.size = sizeMatch[1];
      }
    }
  }

  if (toolContent) {
    try {
      let parsedTool = toolContent;
      if (typeof toolContent === 'string') {
        parsedTool = JSON.parse(toolContent);
      }
      
      if (parsedTool.output) {
        data.output = parsedTool.output;
        const imageMatch = parsedTool.output.match(/Image saved as: ([^\s.]+\.png)/);
        if (imageMatch) {
          data.generatedImagePath = imageMatch[1];
        }
      }
    } catch (e) {
      if (typeof toolContent === 'string') {
        data.output = toolContent;
        const imageMatch = toolContent.match(/Image saved as: ([^\s.]+\.png)/);
        if (imageMatch) {
          data.generatedImagePath = imageMatch[1];
        }
      }
    }
  }

  data.success = isSuccess;
  return data as ImageGenerationData;
}

function constructImageUrl(imagePath: string, project: any): string {
  if (!project?.sandbox?.sandbox_url) {
    return '';
  }
  return `${project.sandbox.sandbox_url}/workspace/${imagePath}`;
}

function SafeImage({ src, alt, filePath, className }: { src: string; alt: string; filePath: string; className?: string }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const { session } = useAuth();

  useEffect(() => {
    const setupAuthenticatedImage = async () => {
      if (src.includes('/sandboxes/') && src.includes('/files/content')) {
        try {
          const response = await fetch(src, {
            headers: {
              'Authorization': `Bearer ${session?.access_token}`
            }
          });

          if (!response.ok) {
            throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
          }

          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setImgSrc(url);
        } catch (err) {
          console.error('Error loading authenticated image:', err);
          setError(true);
        }
      } else {
        setImgSrc(src);
      }
    };

    setupAuthenticatedImage();
    setError(false);
    setAttempts(0);

    return () => {
      if (imgSrc && imgSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imgSrc);
      }
    };
  }, [src, session?.access_token]);

  const handleError = () => {
    if (attempts < 3) {
      setAttempts(attempts + 1);
      if (attempts === 0) {
        setImgSrc(filePath);
      } else if (attempts === 1) {
        if (!filePath.startsWith('/')) {
          setImgSrc(`/${filePath}`);
        } else {
          setError(true);
        }
      } else {
        setError(true);
      }
    } else {
      setError(true);
    }
  };

  const handleZoomToggle = () => {
    setIsZoomed(!isZoomed);
    setZoomLevel(1);
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomLevel(prev => Math.min(prev + 0.25, 3));
    if (!isZoomed) setIsZoomed(true);
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!imgSrc) return;

    const link = document.createElement('a');
    link.href = imgSrc;
    link.download = filePath.split('/').pop() || 'image';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-64 bg-gradient-to-b from-rose-50 to-rose-100 dark:from-rose-950/30 dark:to-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-inner">
        <div className="bg-white dark:bg-black/30 p-3 rounded-full shadow-md mb-3">
          <ImageOff className="h-8 w-8 text-rose-500 dark:text-rose-400" />
        </div>
        <p className="text-sm font-medium">Unable to load generated image</p>
        <p className="text-xs text-rose-600/70 dark:text-rose-400/70 mt-1 max-w-xs text-center break-all">
          {filePath}
        </p>
      </div>
    );
  }

  if (!imgSrc) {
    return (
      <div className="flex py-8 flex-col items-center justify-center w-full h-64 bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-900/50 dark:to-zinc-800/30 rounded-lg border-zinc-200 dark:border-zinc-700/50 shadow-inner">
        <div className="space-y-2 w-full max-w-md py-8">
          <Skeleton className="h-8 w-8 rounded-full mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
          <Skeleton className="h-64 w-full rounded-lg mt-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className={cn(
        "overflow-hidden transition-all duration-300 rounded-3xl border bg-card mb-3",
        isZoomed ? "cursor-zoom-out" : "cursor-zoom-in"
      )}>
        <div className="relative flex items-center justify-center">
          <img
            src={imgSrc}
            alt={alt}
            onClick={handleZoomToggle}
            className={cn(
              "max-w-full object-contain transition-all duration-300 ease-in-out",
              isZoomed
                ? "max-h-[80vh]"
                : "max-h-[500px] hover:scale-[1.01]",
              className
            )}
            style={{
              transform: isZoomed ? `scale(${zoomLevel})` : 'none',
            }}
            onError={handleError}
          />
        </div>
      </div>

      <div className="flex items-center justify-between w-full px-2 py-2 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <Badge variant="secondary" className="bg-white/90 dark:bg-black/70 text-zinc-700 dark:text-zinc-300 shadow-sm">
          <ImageIcon className="h-3 w-3 mr-1" />
          {filePath.split('.').pop()?.toUpperCase()}
        </Badge>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-md bg-white dark:bg-zinc-800"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.5}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs font-mono px-2 text-zinc-700 dark:text-zinc-300 min-w-12 text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-md bg-white dark:bg-zinc-800"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          <span className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-2"></span>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-md bg-white dark:bg-zinc-800"
            onClick={handleDownload}
            title="Download image"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ImageEditOrGenerateToolView({
  assistantContent,
  toolContent,
  assistantTimestamp,
  toolTimestamp,
  isSuccess = true,
  isStreaming = false,
  name,
  project,
}: ToolViewProps) {
  const [progress, setProgress] = useState(0);

  const data = extractImageGenerationData(assistantContent, toolContent, isSuccess);
  const isGenerateMode = data.mode === 'generate';
  const Icon = isGenerateMode ? Sparkles : Wand2;

  useEffect(() => {
    if (isStreaming) {
      const timer = setInterval(() => {
        setProgress((prevProgress) => {
          if (prevProgress >= 95) {
            clearInterval(timer);
            return prevProgress;
          }
          return prevProgress + 5;
        });
      }, 300);
      return () => clearInterval(timer);
    } else {
      setProgress(100);
    }
  }, [isStreaming]);

  // If no generated image path, fall back to generic view
  if (!isStreaming && !data.generatedImagePath) {
    return (
      <GenericToolView
        name={name || 'image-edit-or-generate'}
        assistantContent={assistantContent}
        toolContent={toolContent}
        assistantTimestamp={assistantTimestamp}
        toolTimestamp={toolTimestamp}
        isSuccess={isSuccess}
        isStreaming={isStreaming}
      />
    );
  }

  const config = {
    color: isGenerateMode ? 'text-purple-500 dark:text-purple-400' : 'text-blue-500 dark:text-blue-400',
    bgColor: isGenerateMode 
      ? 'bg-gradient-to-b from-purple-100 to-purple-50 shadow-inner dark:from-purple-800/40 dark:to-purple-900/60 dark:shadow-purple-950/20'
      : 'bg-gradient-to-b from-blue-100 to-blue-50 shadow-inner dark:from-blue-800/40 dark:to-blue-900/60 dark:shadow-blue-950/20',
    badgeColor: isGenerateMode
      ? 'bg-gradient-to-b from-purple-200 to-purple-100 text-purple-700 dark:from-purple-800/50 dark:to-purple-900/60 dark:text-purple-300'
      : 'bg-gradient-to-b from-blue-200 to-blue-100 text-blue-700 dark:from-blue-800/50 dark:to-blue-900/60 dark:text-blue-300',
  };

  const imageUrl = data.generatedImagePath ? constructImageUrl(data.generatedImagePath, project) : '';
  const filename = data.generatedImagePath || 'generated_image.png';
  const toolTitle = isGenerateMode ? 'Generate Image' : 'Edit Image';

  return (
    <Card className="flex border shadow-none border-t border-b-0 border-x-0 p-0 rounded-none flex-col h-full overflow-hidden bg-card">
      <CardHeader className="h-14 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-b p-2 px-4 space-y-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("relative p-2 rounded-xl bg-gradient-to-br border border-opacity-20 transition-colors", config.bgColor)}>
              <Icon className={cn("w-5 h-5", config.color)} />
            </div>
            <div>
              <div className="flex items-center">
                <CardTitle className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                  {toolTitle}
                </CardTitle>
                {data.size && (
                  <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1.5 h-4">
                    {data.size}
                  </Badge>
                )}
              </div>
              {data.prompt && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-md truncate">
                  {truncateString(data.prompt, 50)}
                </p>
              )}
            </div>
          </div>

          {!isStreaming && (
            <Badge
              variant="secondary"
              className={
                isSuccess
                  ? "bg-gradient-to-b from-emerald-200 to-emerald-100 text-emerald-700 dark:from-emerald-800/50 dark:to-emerald-900/60 dark:text-emerald-300"
                  : "bg-gradient-to-b from-rose-200 to-rose-100 text-rose-700 dark:from-rose-800/50 dark:to-rose-900/60 dark:text-rose-300"
              }
            >
              {isSuccess ? (
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              )}
              {isSuccess ? 'Generated' : 'Failed'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-hidden relative">
        {isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full p-12 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900">
            <div className="text-center w-full max-w-xs">
              <div className="space-y-3 mb-6">
                <div className={cn("w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center", config.bgColor)}>
                  <Icon className={cn("h-8 w-8", config.color)} />
                </div>
                <h3 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
                  {isGenerateMode ? "Generating image..." : "Editing image..."}
                </h3>
                {data.prompt && (
                  <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 w-full text-center mb-6 shadow-sm">
                    <code className="text-sm font-mono text-zinc-700 dark:text-zinc-300 break-all">
                      {data.prompt}
                    </code>
                  </div>
                )}
              </div>
              <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300 ease-out",
                    isGenerateMode 
                      ? "bg-gradient-to-r from-purple-400 to-purple-500 dark:from-purple-600 dark:to-purple-400"
                      : "bg-gradient-to-r from-blue-400 to-blue-500 dark:from-blue-600 dark:to-blue-400"
                  )}
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">{progress}%</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="relative w-full overflow-hidden p-6 flex items-center justify-center">
              {data.generatedImagePath && project ? (
                <SafeImage
                  src={imageUrl}
                  alt={`Generated image: ${data.prompt || 'AI generated image'}`}
                  filePath={data.generatedImagePath}
                  className="max-w-full max-h-[500px] object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-zinc-500 dark:text-zinc-400">
                  <ImageOff className="h-12 w-12 mb-4" />
                  <p className="text-sm">No image generated</p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <div className="h-10 px-4 py-2 bg-gradient-to-r from-zinc-50/90 to-zinc-100/90 dark:from-zinc-900/90 dark:to-zinc-800/90 backdrop-blur-sm border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Badge className={cn("py-0.5 h-6 border", config.badgeColor)}>
            <Icon className="h-3 w-3 mr-1" />
            {isGenerateMode ? 'GENERATED' : 'EDITED'}
          </Badge>
          <Badge variant="outline" className="py-0 px-1.5 h-5 text-[10px] uppercase font-medium">
            PNG
          </Badge>
        </div>

        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {toolTimestamp ? formatTimestamp(toolTimestamp) : ''}
        </div>
      </div>
    </Card>
  );
} 