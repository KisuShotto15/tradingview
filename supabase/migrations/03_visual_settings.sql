-- Migración 03: visual_settings en chart y watchlist items con labels
-- Correr en el SQL Editor de Supabase

-- Ajustes visuales (colores de vela, estilos de indicadores, EMAs, chartType)
ALTER TABLE public.user_chart_settings
  ADD COLUMN IF NOT EXISTS visual_settings JSONB NOT NULL DEFAULT '{}';

-- Watchlist completa con labels/separadores (no solo símbolos)
ALTER TABLE public.user_watchlists
  ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]';
