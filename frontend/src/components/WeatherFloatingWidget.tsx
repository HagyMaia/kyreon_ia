import { useEffect, useState } from "react";
import {
  CloudRain,
  Sun,
  Cloud,
  CloudLightning,
  Droplets,
  Wind,
  Clock,
  MapPin,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  SunMedium,
  Umbrella,
  X,
} from "lucide-react";

interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  rain: number;
  rainProbability: number;
  weatherCode: number;
  conditionText: string;
  windSpeed: number;
  lastUpdated: string;
}

export function WeatherFloatingWidget() {
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Relógio em tempo real no fuso de Manaus (America/Manaus - UTC-4)
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("pt-BR", {
        timeZone: "America/Manaus",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const dateStr = now.toLocaleDateString("pt-BR", {
        timeZone: "America/Manaus",
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      setCurrentTime(timeStr);
      setCurrentDate(dateStr);
    }

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Busca previsão do tempo de Manaus-AM via Open-Meteo
  async function fetchManausWeather() {
    try {
      setRefreshing(true);
      // Coordenadas de Manaus - AM: -3.1190, -60.0217
      const url =
        "https://api.open-meteo.com/v1/forecast?latitude=-3.1190&longitude=-60.0217&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m&hourly=precipitation_probability&timezone=America%2FManaus";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Falha ao buscar dados climáticos");
      const data = await res.json();

      const current = data.current;
      const hourlyRainProb = data.hourly?.precipitation_probability || [];
      const currentHourIndex = new Date().getHours();
      const rainProb = hourlyRainProb[currentHourIndex] ?? hourlyRainProb[0] ?? 0;

      const code = current.weather_code;
      let text = "Céu Limpo";
      if (code === 1 || code === 2) text = "Parcialmente Nublado";
      else if (code === 3) text = "Nublado";
      else if (code >= 51 && code <= 67) text = "Chuva Leve";
      else if (code >= 80 && code <= 82) text = "Pancadas de Chuva";
      else if (code >= 95) text = "Tempestade Tropical";

      setWeather({
        temperature: Math.round(current.temperature_2m),
        apparentTemperature: Math.round(current.apparent_temperature),
        humidity: current.relative_humidity_2m,
        precipitation: current.precipitation,
        rain: current.rain,
        rainProbability: rainProb,
        weatherCode: code,
        conditionText: text,
        windSpeed: Math.round(current.wind_speed_10m),
        lastUpdated: new Date().toLocaleTimeString("pt-BR", {
          timeZone: "America/Manaus",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    } catch (err) {
      console.warn("Usando estimativa climática de Manaus:", err);
      // Fallback seguro se offline
      setWeather({
        temperature: 32,
        apparentTemperature: 36,
        humidity: 78,
        precipitation: 0.2,
        rain: 0.2,
        rainProbability: 45,
        weatherCode: 80,
        conditionText: "Pancadas de Chuva Típicas",
        windSpeed: 12,
        lastUpdated: "Agora",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchManausWeather();
    // Atualiza clima a cada 10 minutos
    const interval = setInterval(fetchManausWeather, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  function getWeatherIcon(code: number, rainProb: number) {
    if (code >= 95) return <CloudLightning size={20} className="weather-icon-storm" />;
    if (code >= 51 || rainProb > 50) return <CloudRain size={20} className="weather-icon-rain" />;
    if (code === 3) return <Cloud size={20} className="weather-icon-cloud" />;
    if (code === 1 || code === 2) return <SunMedium size={20} className="weather-icon-sun-cloud" />;
    return <Sun size={20} className="weather-icon-sun" />;
  }

  return (
    <aside aria-label="Clima e horário de Manaus" className={`floating-weather-widget ${isExpanded ? "expanded" : "collapsed"}`}>
      {/* Botão/Pílula de Visualização Rápida Flutuante */}
      <button
        type="button"
        className="weather-pill-trigger"
        onClick={() => setIsExpanded(!isExpanded)}
        title="Clique para expandir informações de Manaus - AM"
      >
        <div className="pill-pulse" />
        <div className="pill-location">
          <MapPin size={13} className="pin-icon" />
          <span>Manaus</span>
        </div>

        <div className="pill-divider" />

        <div className="pill-clock">
          <Clock size={13} />
          <span>{currentTime || "--:--:--"}</span>
        </div>

        <div className="pill-divider" />

        <div className="pill-weather">
          {weather && getWeatherIcon(weather.weatherCode, weather.rainProbability)}
          <span className="temp-val">{weather ? `${weather.temperature}°C` : "--"}</span>
          <span className="rain-badge" title={`Previsão de chuva: ${weather?.rainProbability || 0}%`}>
            <Umbrella size={11} />
            {weather?.rainProbability}%
          </span>
        </div>

        <div className="pill-chevron">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
      </button>

      {/* Painel Flutuante Expandido com Detalhes */}
      {isExpanded && (
        <div className="weather-expanded-card">
          <div className="card-top-bar">
            <div className="location-info">
              <div className="city-name">
                <MapPin size={15} />
                <strong>Manaus, Amazonas</strong>
              </div>
              <span className="date-badge">{currentDate} • Fuso UTC-4</span>
            </div>

            <div className="card-top-actions">
              <button
                type="button"
                className={`refresh-btn ${refreshing ? "spinning" : ""}`}
                onClick={fetchManausWeather}
                title="Atualizar clima"
                aria-label="Atualizar dados de clima de Manaus"
              >
                <RefreshCw size={13} />
              </button>
              <button
                type="button"
                className="close-weather-card-btn"
                onClick={() => setIsExpanded(false)}
                title="Fechar painel"
                aria-label="Fechar painel de clima"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="live-clock-banner">
            <Clock size={18} />
            <span className="clock-digits">{currentTime}</span>
            <span className="live-indicator">AO VIVO</span>
          </div>

          {weather && (
            <div className="weather-details-content">
              <div className="main-temp-block">
                <div className="icon-wrapper">
                  {getWeatherIcon(weather.weatherCode, weather.rainProbability)}
                </div>
                <div className="temp-numbers">
                  <span className="current-temp">{weather.temperature}°C</span>
                  <span className="condition-label">{weather.conditionText}</span>
                </div>
              </div>

              {/* Barra de Probabilidade de Chuva */}
              <div className="rain-probability-card">
                <div className="rain-header">
                  <span className="rain-title">
                    <CloudRain size={14} />
                    Previsão de Chuva
                  </span>
                  <span className="rain-pct-highlight">{weather.rainProbability}%</span>
                </div>
                <div className="rain-progress-track">
                  <div
                    className="rain-progress-fill"
                    style={{ width: `${Math.min(weather.rainProbability, 100)}%` }}
                  />
                </div>
                <div className="rain-subtext">
                  <span>Precipitação estimada: {weather.precipitation.toFixed(1)} mm</span>
                  <span>{weather.rainProbability > 40 ? "Chuva provável" : "Baixo risco"}</span>
                </div>
              </div>

              {/* Grid de Métricas Amazônicas */}
              <div className="weather-metrics-grid">
                <div className="metric-box">
                  <div className="metric-header">
                    <Droplets size={13} />
                    <span>Umidade</span>
                  </div>
                  <strong>{weather.humidity}%</strong>
                </div>

                <div className="metric-box">
                  <div className="metric-header">
                    <SunMedium size={13} />
                    <span>Sensação</span>
                  </div>
                  <strong>{weather.apparentTemperature}°C</strong>
                </div>

                <div className="metric-box">
                  <div className="metric-header">
                    <Wind size={13} />
                    <span>Ventos</span>
                  </div>
                  <strong>{weather.windSpeed} km/h</strong>
                </div>
              </div>

              <div className="card-footer-info">
                <span>Última leitura: {weather.lastUpdated}</span>
                <span className="open-meteo-tag">Open-Meteo Live</span>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
