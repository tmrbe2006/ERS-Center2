import React, { useEffect, useRef, useState } from 'react';
import { Emergency, User, UserRole } from '../types';
import { useApp } from '../context/AppContext';
import { 
  Maximize2, Map as MapIcon, Satellite, ZoomIn, ZoomOut, X, 
  User as UserIcon, Shield, Navigation2, 
  Target, Clock, ShieldCheck, Globe
} from 'lucide-react';

interface LiveMapProps {
  emergencies: Emergency[];
  users?: User[];
  height?: string;
}

const countryCenters: Record<string, { lat: number, lng: number, zoom: number }> = {
  'Egypt': { lat: 26.8206, lng: 30.8025, zoom: 6 },
  'Saudi Arabia': { lat: 23.8859, lng: 45.0792, zoom: 5 },
  'Kuwait': { lat: 29.3117, lng: 47.4818, zoom: 9 },
  'United Arab Emirates': { lat: 23.4241, lng: 53.8478, zoom: 7 },
  'Qatar': { lat: 25.3548, lng: 51.1839, zoom: 9 },
};

export const LiveMap: React.FC<LiveMapProps> = ({ emergencies, users = [], height = "500px" }) => {
  const { user: currentUser } = useApp();
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, any>>({});
  const pathsRef = useRef<Record<string, any>>({}); 
  const accuracyCirclesRef = useRef<Record<string, any>>({});
  const userHistoryRef = useRef<Record<string, [number, number][]>>({});
  
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;
    
    // التمركز الافتراضي المبدئي (الرياض)
    mapRef.current = L.map(containerRef.current, {
      center: [23.8859, 45.0792], 
      zoom: 5,
      zoomControl: false,
      attributionControl: false
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    
    return () => { 
        if (mapRef.current) { 
            try {
                mapRef.current.remove(); 
            } catch (e) {}
            mapRef.current = null; 
        } 
    };
  }, []);

  // تمركز ديناميكي بناءً على دولة المستخدم
  useEffect(() => {
    if (mapRef.current && currentUser?.country) {
      const center = countryCenters[currentUser.country];
      if (center) {
        mapRef.current.flyTo([center.lat, center.lng], center.zoom, {
          duration: 2.5,
          easeLinearity: 0.25
        });
      }
    }
  }, [currentUser?.country]);

  useEffect(() => {
    if (!mapRef.current) return;
    const L = (window as any).L;
    mapRef.current.eachLayer((layer: any) => { 
      if (layer instanceof L.TileLayer) {
        try { mapRef.current.removeLayer(layer); } catch (e) {}
      } 
    });
    if (mapLayer === 'streets') L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    else L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(mapRef.current);
  }, [mapLayer]);

  useEffect(() => {
    if (!mapRef.current) return;
    const L = (window as any).L;
    const activePoints: [number, number][] = [];

    const currentIds = new Set(users.map(u => u.id));
    Object.keys(markersRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        if (markersRef.current[id]) {
            try { 
              if (mapRef.current.hasLayer(markersRef.current[id])) {
                mapRef.current.removeLayer(markersRef.current[id]); 
              }
            } catch(e){}
            delete markersRef.current[id];
        }
        if (pathsRef.current[id]) {
          try { 
            if (mapRef.current.hasLayer(pathsRef.current[id])) {
              mapRef.current.removeLayer(pathsRef.current[id]); 
            }
          } catch(e){} 
          delete pathsRef.current[id];
        }
        if (accuracyCirclesRef.current[id]) {
          try { 
            if (mapRef.current.hasLayer(accuracyCirclesRef.current[id])) {
              mapRef.current.removeLayer(accuracyCirclesRef.current[id]); 
            }
          } catch(e){} 
          delete accuracyCirclesRef.current[id];
        }
        delete userHistoryRef.current[id];
      }
    });

    const now = Date.now();
    users.forEach((u) => {
      if (!u.lastLocation || (u.lastLocation.lat === 0 && u.lastLocation.lng === 0)) return;
      
      const isMe = u.id === currentUser?.id;
      const locTime = u.lastLocation.timestamp || 0;
      const ageMs = now - locTime;
      const isLiveFresh = (u.lastLocation.isLiveShift || false) && ageMs < 90000;
      const isRecent = ageMs < 300000; // 5 mins
      
      let markerColor = '#6b7280'; // Stale / offline
      if (isLiveFresh) markerColor = '#10b981'; // Live active shift
      else if (isRecent) markerColor = '#f59e0b'; // Recent
      if (isMe) markerColor = '#3b82f6';

      const lat = Number(u.lastLocation.lat);
      const lng = Number(u.lastLocation.lng);
      if (isNaN(lat) || isNaN(lng)) return;
      activePoints.push([lat, lng]);

      // Draw GPS accuracy circle
      if (accuracyCirclesRef.current[u.id]) {
        try {
          if (mapRef.current.hasLayer(accuracyCirclesRef.current[u.id])) {
            mapRef.current.removeLayer(accuracyCirclesRef.current[u.id]);
          }
        } catch(e){}
      }
      const acc = u.lastLocation.accuracy;
      if (acc && acc > 0 && acc <= 1000 && (isLiveFresh || isMe)) {
        try {
          accuracyCirclesRef.current[u.id] = L.circle([lat, lng], {
            radius: acc,
            color: markerColor,
            fillColor: markerColor,
            fillOpacity: 0.12,
            weight: 1
          }).addTo(mapRef.current);
        } catch(e){}
      }

      if (!userHistoryRef.current[u.id]) userHistoryRef.current[u.id] = [];
      const history = userHistoryRef.current[u.id];
      const lastPoint = history[history.length - 1];
      if (!lastPoint || lastPoint[0] !== lat || lastPoint[1] !== lng) {
        history.push([lat, lng]);
        if (history.length > 20) history.shift();
      }

      if (pathsRef.current[u.id]) { 
        try { 
          if (mapRef.current.hasLayer(pathsRef.current[u.id])) {
            mapRef.current.removeLayer(pathsRef.current[u.id]); 
          }
        } catch(e){} 
      }
      if (history.length > 1) {
        try {
          pathsRef.current[u.id] = L.polyline(history, { color: markerColor, weight: 3, opacity: 0.3, dashArray: '5, 10' }).addTo(mapRef.current);
        } catch (e) {}
      }

      let roleIconHtml = u.name.charAt(0).toUpperCase();
      if (u.role === UserRole.RESPONDER) {
        roleIconHtml = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
      }

      const existingMarker = markersRef.current[u.id];
      if (existingMarker && mapRef.current.hasLayer(existingMarker)) {
          try {
              if (existingMarker.getElement()) {
                  existingMarker.setLatLng([lat, lng]);
                  const el = existingMarker.getElement();
                  const inner = el.querySelector('.marker-inner');
                  const ping = el.querySelector('.ping-effect');
                  if (inner) { inner.style.backgroundColor = markerColor; inner.style.opacity = isLiveFresh ? '1' : '0.6'; }
                  if (ping) { ping.style.backgroundColor = markerColor; ping.style.display = isLiveFresh ? 'block' : 'none'; }
              }
          } catch (e) {
            try { mapRef.current.removeLayer(existingMarker); } catch(err){}
            delete markersRef.current[u.id];
          }
      } else {
          try {
            const icon = L.divIcon({
              className: 'custom-div-icon',
              html: `
                <div class="responder-marker relative flex items-center justify-center">
                  <div class="ping-effect absolute w-10 h-10 rounded-full opacity-30 ${isLiveFresh ? 'animate-ping' : 'hidden'}" style="background-color: ${markerColor}"></div>
                  <div class="marker-inner w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white font-black z-10" style="background-color: ${markerColor}; opacity: ${isLiveFresh ? '1' : '0.7'}">
                    ${roleIconHtml}
                  </div>
                </div>
              `,
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            });

            const marker = L.marker([lat, lng], { icon, zIndexOffset: isMe ? 1000 : 500 }).addTo(mapRef.current);
            marker.on('click', () => setSelectedUser(u));
            markersRef.current[u.id] = marker;
          } catch (e) {}
      }
    });

    if (activePoints.length > 0 && mapRef.current.getZoom() < 7 && !currentUser?.country) {
        try { mapRef.current.fitBounds(L.latLngBounds(activePoints), { padding: [50, 50], maxZoom: 12 }); } catch (e) {}
    }
  }, [users, currentUser?.id, currentUser?.country]);

  return (
    <div className="relative group rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700" style={{ height }}>
      <div ref={containerRef} className="w-full h-full z-0" />
      <div className="absolute top-6 right-6 z-10 flex flex-col gap-2">
        <button onClick={() => mapRef.current?.zoomIn()} className="p-3 bg-white dark:bg-gray-800 rounded-2xl shadow-xl hover:bg-gray-50 transition-colors"><ZoomIn size={18}/></button>
        <button onClick={() => mapRef.current?.zoomOut()} className="p-3 bg-white dark:bg-gray-800 rounded-2xl shadow-xl hover:bg-gray-50 transition-colors"><ZoomOut size={18}/></button>
        <button onClick={() => setMapLayer(mapLayer === 'streets' ? 'satellite' : 'streets')} className="p-3 bg-white dark:bg-gray-800 rounded-2xl shadow-xl hover:bg-gray-50 transition-colors">
          {mapLayer === 'streets' ? <Satellite size={18}/> : <MapIcon size={18}/>}
        </button>
      </div>

      {selectedUser && (
        <div className="absolute bottom-6 left-6 right-6 md:left-auto md:w-84 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur p-6 rounded-[2rem] shadow-2xl border border-white/20">
            <button onClick={() => setSelectedUser(null)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500"><X size={20}/></button>
            <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                    <ShieldCheck size={28}/>
                </div>
                <div>
                    <h4 className="font-black text-lg dark:text-white leading-tight">{selectedUser.name}</h4>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                      {selectedUser.role} {selectedUser.department ? `• ${selectedUser.department}` : ''}
                    </p>
                </div>
            </div>

            {/* Freshness Status Banner */}
            <div className="mb-3">
              {selectedUser.lastLocation?.isLiveShift && (Date.now() - (selectedUser.lastLocation.timestamp || 0)) < 90000 ? (
                <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 rounded-xl text-xs font-black">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping"></span>
                  <span>موقع حي ومباشر (مناوبة نشطة)</span>
                </div>
              ) : (Date.now() - (selectedUser.lastLocation?.timestamp || 0)) < 300000 ? (
                <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span>موقع حديث (غير نشط حالياً)</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl text-xs font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
                  <span>آخر موقع مسجل (قديم)</span>
                </div>
              )}
            </div>

            <div className="space-y-2 text-xs">
                {selectedUser.lastLocation?.accuracy !== undefined && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                    <div className="flex items-center gap-2 text-gray-500 font-bold">
                        <Target size={14} className="text-red-500"/>
                        <span>دقة تحديد الموقع (GPS)</span>
                    </div>
                    <span className="font-black dark:text-gray-200">± {selectedUser.lastLocation.accuracy} متر</span>
                  </div>
                )}
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                    <div className="flex items-center gap-2 text-gray-500 font-bold">
                        <Clock size={14} className="text-blue-500"/>
                        <span>آخر تحديث للموقع</span>
                    </div>
                    <span className="font-black dark:text-gray-200">
                        {selectedUser.lastLocation?.timestamp 
                          ? new Date(selectedUser.lastLocation.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'}) 
                          : 'غير متوفر'}
                    </span>
                </div>
                {selectedUser.country && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                    <div className="flex items-center gap-2 text-gray-500 font-bold">
                        <Globe className="text-green-500" size={14}/>
                        <span>البلد</span>
                    </div>
                    <span className="font-black dark:text-gray-200">{selectedUser.country}</span>
                  </div>
                )}
            </div>
        </div>
      )}
    </div>
  );
};