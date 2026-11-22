import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/auth/auth-provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent, type PointerEvent, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameUI as ui } from '@/constants/game-ui';
import { Controls, controlKeys, emptyControls, type Gearing } from '@/game/physics';
import { createScene } from '@/game/scene';
import { createChallengeRun } from '@/game/challenge-run';
import { ChallengeHud, ChallengeOverlay } from './challenge-hud';
import ChallengeMenu from './challenge-menu';
import { createTouchControls } from '@/game/touch-controls';
import { vehicles, type VehicleId } from '@/game/vehicles';
import VehicleGarage from './vehicle-garage';
import OnlineMenu from './online-menu';
import { createMultiplayerClient, offlineStatus } from '@/game/multiplayer-client';
import type { RoomSnapshot, TestLocation } from '@/game/network-types';
import { nearbyEngines } from '@/game/engine-audio';
import { useEngineSounds } from '@/hooks/use-engine-sounds';
import { useHornSounds } from '@/hooks/use-horn-sounds';
import { createHornPulse, nearbyHorns } from '@/game/horn-audio';
import DrivingControls from './driving-controls';
import { useControlPreferences } from '@/hooks/use-control-preferences';
import { useGameSettings } from '@/hooks/use-game-settings';
import { useGameFeedback } from '@/hooks/use-game-feedback';
import CompetitionHud from './competition-hud';
import ModeInstructions from './mode-instructions';
import { interfaceTiming } from '@/game/interface-config';

type Scene = ReturnType<typeof createScene>;
type ControlKey = keyof Controls;

export default function DrivingScene({ initialCar = 'jeep', course = 'garage', connection }: {
  initialCar?: VehicleId; course?: TestLocation | 'challenge';
  connection?: { room: import('colyseus.js').Room; client: import('colyseus.js').Client; onAdopt: () => void };
}) {
  const auth = useAuth();
  const preferredColor = useRef(auth.profile?.vehicle_color ?? null);
  const routeActive = useRef(true);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = height < 480 || width < 600;
  const { preferences, updatePreferences, saved: controlsSaved } = useControlPreferences();
  const { settings, loaded: settingsLoaded, saved: settingsSaved, updateSettings } = useGameSettings();
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const { feedback, cancelFeedback } = useGameFeedback(settingsLoaded && settings.vibration);
  // Stay silent until storage has loaded, including the first engine/horn tick.
  const muted = !settingsLoaded || !settings.sound;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<'play' | 'controls' | 'settings'>('play');
  const toolsVisible = useRef(false);
  const [challengeStatus, setChallengeStatus] = useState(() => createChallengeRun().status());
  const challengeState = useRef(challengeStatus);
  const [challengeMenuOpen, setChallengeMenuOpen] = useState(false);
  const challengeMenuVisible = useRef(false);
  const [challengeVehicle, setChallengeVehicle] = useState<VehicleId>('jeep');
  const { updateSound, unlockSound: unlockEngine, releaseSound, silenceSound: silenceEngine } = useEngineSounds(muted);
  const { updateHorn, silenceHorn, unlockHorn } = useHornSounds(muted);
  const unlockSound = useCallback(() => { unlockEngine(); unlockHorn(); }, [unlockEngine, unlockHorn]);
  const silenceSound = useCallback(() => { silenceEngine(); silenceHorn(); }, [silenceEngine, silenceHorn]);
  const [hornPressed, setHornPressed] = useState(false);
  const focused = useRef(true);
  const touch = useRef(emptyControls());
  const fingers = useRef(createTouchControls());
  const [pressedControls, setPressedControls] = useState(emptyControls);
  const keyboard = useRef(emptyControls());
  const updatePressed = useCallback(() => {
    const combined = emptyControls(); controlKeys.forEach(key => { combined[key] = Boolean(touch.current[key] || keyboard.current[key]); });
    setPressedControls(combined);
  }, []);
  const holdControl = useCallback((identifier: number, control: ControlKey) => { touch.current = fingers.current.press(identifier, control); updatePressed(); }, [updatePressed]);
  const releaseControl = useCallback((identifier: number) => { touch.current = fingers.current.release(identifier); updatePressed(); }, [updatePressed]);
  const scene = useRef<Scene | null>(null);
  const network = useRef<ReturnType<typeof createMultiplayerClient> | null>(null);
  const onlineState = useRef(offlineStatus());
  const [online, setOnline] = useState(offlineStatus);
  const onlineMenuVisible = useRef(false);
  const [onlineMenuOpen, setOnlineMenuOpen] = useState(false);
  const lastNetworkState = useRef<{ snapshot: RoomSnapshot; sessionId: string } | null>(null);
  const networkRevision = useRef(-1);
  const animation = useRef(0);
  const running = useRef(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [telemetry, setTelemetry] = useState({ speed: 0, reverse: false });
  const [camera, setCamera] = useState(0);
  const selectedVehicle = useRef<VehicleId>(initialCar);
  const [vehicleId, setVehicleId] = useState<VehicleId>(initialCar);
  const [location, setLocation] = useState<TestLocation>(course === 'challenge' ? 'garage' : course);
  const resetLocation = useRef<TestLocation>(course === 'race' ? 'race' : 'garage');
  const garageVisible = useRef(false);
  const [garageOpen, setGarageOpen] = useState(false);
  const gearingRef = useRef<Gearing>(course === 'trail' ? 'low' : 'high');
  useEffect(() => { scene.current?.setReducedGraphics(settings.reducedGraphics); }, [settings.reducedGraphics]);
  const hornPulse = useRef<ReturnType<typeof createHornPulse> | null>(null);
  useEffect(() => {
    const pulse = createHornPulse((active, tone) => { setHornPressed(active); network.current?.setHorn(active, tone); });
    hornPulse.current = pulse;
    return () => { pulse.dispose(); hornPulse.current = null; };
  }, []);
  const honk = useCallback((pressed: boolean) => {
    unlockSound();
    if (pressed) { feedback(); hornPulse.current?.trigger(); }
    else hornPulse.current?.release();
  }, [unlockSound, feedback]);
  const selectGearing = useCallback((value: Gearing) => {
    gearingRef.current = value;
  }, []);
  const clearInput = useCallback(() => {
    touch.current = fingers.current.clear(); keyboard.current = emptyControls();
    scene.current?.cancelCameraDrag();
    scene.current?.clearPredictionInput();
    network.current?.release();
    releaseSound();
    hornPulse.current?.release(); silenceHorn();
    cancelFeedback();
    setPressedControls(touch.current);
  }, [releaseSound, silenceHorn, cancelFeedback]);
  const openTools = useCallback(() => { clearInput(); setMenuTab('play'); toolsVisible.current = true; setToolsOpen(true); }, [clearInput]);
  const closeTools = useCallback(() => { clearInput(); toolsVisible.current = false; setToolsOpen(false); }, [clearInput]);
  useFocusEffect(useCallback(() => {
    routeActive.current = true;
    network.current?.setActive(AppState.currentState === 'active');
    return () => { routeActive.current = false; clearInput(); silenceSound(); network.current?.setActive(false); };
  }, [clearInput, silenceSound]));
  useEffect(() => { preferredColor.current = auth.profile?.vehicle_color ?? null; scene.current?.setPreferredColor(preferredColor.current); }, [auth.profile?.vehicle_color]);
  useEffect(() => { network.current?.leave(); }, [auth.session?.user.id]);
  useEffect(() => { if (auth.session) void network.current?.refreshAuth(); }, [auth.session]);
  useEffect(() => { if (auth.profile) void network.current?.refreshAuth(); }, [auth.profile]);
  const startChallenge = useCallback((id: VehicleId) => {
    if (!scene.current || onlineState.current.room) return;
    clearInput(); unlockSound();
    const status = scene.current.startChallenge(id);
    if (!status) return;
    challengeState.current = status; setChallengeStatus(status);
    selectedVehicle.current = id; setVehicleId(id);
    challengeMenuVisible.current = false; setChallengeMenuOpen(false);
    resetLocation.current = 'garage'; setLocation('garage');
    selectGearing('high'); toolsVisible.current = false; setToolsOpen(false);
  }, [clearInput, selectGearing, unlockSound]);
  const leaveChallenge = useCallback(() => {
    clearInput(); scene.current?.leaveChallenge();
    const status = { ...challengeState.current, phase: 'idle' as const };
    challengeState.current = status; setChallengeStatus(status); setLocation('garage');
  }, [clearInput]);
  const openChallengeMenu = useCallback(() => {
    if (!scene.current || onlineState.current.room) return;
    clearInput(); silenceSound();
    if (challengeState.current.phase === 'finished') leaveChallenge();
    setChallengeVehicle(selectedVehicle.current);
    challengeMenuVisible.current = true; setChallengeMenuOpen(true); toolsVisible.current = false; setToolsOpen(false);
  }, [clearInput, silenceSound, leaveChallenge]);
  const closeChallengeMenu = useCallback(() => {
    clearInput(); challengeMenuVisible.current = false; setChallengeMenuOpen(false);
  }, [clearInput]);
  const reset = useCallback(() => {
    if (onlineState.current.room && onlineState.current.phase !== 'online') return;
    clearInput(); feedback();
    if (challengeState.current.phase !== 'idle') { scene.current?.reset(); return; }
    if (onlineState.current.room) { network.current?.reset(resetLocation.current); return; }
    selectGearing('high');
    if (resetLocation.current === 'race') scene.current?.startRace();
    else scene.current?.reset();
    setLocation(resetLocation.current);
    setTelemetry({ speed: 0, reverse: false });
  }, [clearInput, selectGearing, feedback]);
  const startTrail = useCallback(() => {
    if (onlineState.current.room || challengeState.current.phase !== 'idle') return;
    clearInput();
    scene.current?.startTrail();
    resetLocation.current = 'garage'; setLocation('trail');
    selectGearing('low'); setTelemetry({ speed: 0, reverse: false });
  }, [clearInput, selectGearing]);
  const startRace = useCallback(() => {
    if (onlineState.current.room || challengeState.current.phase !== 'idle') return;
    clearInput();
    scene.current?.startRace();
    resetLocation.current = 'race'; setLocation('race');
    selectGearing('high'); setTelemetry({ speed: 0, reverse: false });
  }, [clearInput, selectGearing]);
  const toggleCamera = useCallback(() => {
    const mode = scene.current?.toggleCamera();
    if (mode !== undefined) setCamera(mode);
  }, []);
  const openGarage = useCallback(() => {
    if (challengeState.current.phase !== 'idle' || onlineState.current.tournament?.started) return;
    clearInput(); silenceSound(); garageVisible.current = true; setGarageOpen(true);
  }, [clearInput, silenceSound]);
  const closeGarage = useCallback(() => {
    clearInput(); garageVisible.current = false; setGarageOpen(false);
  }, [clearInput]);
  const openOnlineMenu = useCallback(() => {
    clearInput(); silenceSound(); garageVisible.current = false; setGarageOpen(false);
    onlineMenuVisible.current = true; setOnlineMenuOpen(true);
  }, [clearInput, silenceSound]);
  const closeOnlineMenu = useCallback(() => {
    clearInput(); onlineMenuVisible.current = false; setOnlineMenuOpen(false);
  }, [clearInput]);
  const testVehicle = useCallback((id: VehicleId, location: TestLocation) => {
    if (!scene.current) return;
    if (onlineState.current.room && onlineState.current.phase !== 'online') return;
    clearInput();
    if (onlineState.current.room) {
      network.current?.selectVehicle(id, location);
      closeGarage();
      return;
    }
    scene.current.setVehicle(id, location);
    selectedVehicle.current = id; setVehicleId(id);
    resetLocation.current = location === 'race' ? 'race' : 'garage'; setLocation(location);
    selectGearing(location === 'trail' ? 'low' : 'high');
    setTelemetry({ speed: 0, reverse: false }); closeGarage();
  }, [clearInput, closeGarage, selectGearing]);

  useEffect(() => {
    network.current = createMultiplayerClient(status => {
      if (status.phase === 'reconnecting') {
        if (onlineState.current.phase !== 'reconnecting') { clearInput(); silenceSound(); }
        scene.current?.suspendPrediction();
      }
      if (status.phase === 'online' && onlineState.current.phase === 'reconnecting') { clearInput(); silenceSound(); }
      const phase = status.tournament?.phase;
      if (phase && phase !== onlineState.current.tournament?.phase) {
        toolsVisible.current = false; setToolsOpen(false);
        if (phase === 'countdown') { clearInput(); onlineMenuVisible.current = false; setOnlineMenuOpen(false); resetLocation.current = 'race'; setLocation('race'); }
        else if (['lobby', 'results', 'garage', 'finished'].includes(phase)) { clearInput(); silenceSound(); onlineMenuVisible.current = true; setOnlineMenuOpen(true); if (phase === 'garage') { resetLocation.current = 'garage'; setLocation('garage'); } }
      }
      if ((status.phase === 'offline' || status.phase === 'error') && onlineState.current.room) {
        clearInput(); silenceSound();
        scene.current?.leaveNetwork(selectedVehicle.current); lastNetworkState.current = null;
        selectGearing('high');
        resetLocation.current = 'garage'; setLocation('garage');
      }
      if (status.phase === 'connecting') networkRevision.current = -1;
      onlineState.current = status; setOnline(status);
    }, (snapshot, sessionId) => {
      lastNetworkState.current = { snapshot, sessionId };
      scene.current?.setNetworkSnapshot(snapshot, sessionId);
      const own = snapshot.players.find(player => player.id === sessionId);
      if (own) {
        if (selectedVehicle.current !== own.vehicleId) { selectedVehicle.current = own.vehicleId; setVehicleId(own.vehicleId); }
        if (networkRevision.current !== own.revision) {
          networkRevision.current = own.revision; selectGearing(own.gearing);
          if (own.location) { resetLocation.current = own.location === 'race' ? 'race' : 'garage'; setLocation(own.location); }
        }
      }
    }, { prediction: true });
    network.current.setActive(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
    if (connection) {
      network.current.adopt(connection.room, connection.client, auth.getAccessToken);
      connection.onAdopt();
    }
    return () => { network.current?.dispose(); network.current = null; };
  }, [selectGearing, clearInput, silenceSound, connection, auth.getAccessToken]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      running.current = state === 'active'; clearInput();
      network.current?.setActive(state === 'active' && routeActive.current);
      if (!running.current) silenceSound();
    });
    if (Platform.OS !== 'web') return () => subscription.remove();
    const keyMap: Record<string, ControlKey> = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'throttle', w: 'throttle', ArrowDown: 'reverse', s: 'reverse', ' ': 'brake', q: 'flipBackward', e: 'flipForward' };
    const keyDown = (event: KeyboardEvent) => {
      if (!routeActive.current) return;
      if ((event.key === ' ' || event.key === 'Enter') && event.target instanceof HTMLElement && event.target.closest('button,[role="button"],[role="switch"]')) return;
      if (toolsVisible.current) { if (event.key === 'Escape') closeTools(); return; }
      if (challengeMenuVisible.current) { if (event.key === 'Escape') closeChallengeMenu(); return; }
      if (onlineMenuVisible.current) { if (event.key === 'Escape') closeOnlineMenu(); return; }
      if (garageVisible.current) {
        if (event.key === 'Escape') closeGarage();
        return;
      }
      if (challengeState.current.phase === 'finished') {
        if (event.key === 'Enter') startChallenge(challengeState.current.vehicleId);
        if (event.key === 'Escape') leaveChallenge();
        return;
      }
      const key = keyMap[event.key] ?? keyMap[event.key.toLowerCase()];
      if ((key === 'flipForward' || key === 'flipBackward') && onlineState.current.tournament?.phase !== 'race') return;
      if (key) unlockSound();
      if (key) { event.preventDefault(); if (!keyboard.current[key]) { keyboard.current[key] = true; updatePressed(); } }
      if (event.key === 'Escape' && !event.repeat) openTools();
      if (event.key.toLowerCase() === 'b' && !event.repeat) { event.preventDefault(); honk(true); }
      if (event.key.toLowerCase() === 'r' && !event.repeat) reset();
      if (event.key.toLowerCase() === 'c' && !event.repeat) toggleCamera();
      if (event.key.toLowerCase() === 't' && !event.repeat) startTrail();
      if (event.key.toLowerCase() === 'p' && !event.repeat) startRace();
      if (event.key.toLowerCase() === 'n' && !event.repeat) openChallengeMenu();
      if (event.key.toLowerCase() === 'v' && !event.repeat) openGarage();
      if (event.key.toLowerCase() === 'm' && !event.repeat) openOnlineMenu();
    };
    const keyUp = (event: KeyboardEvent) => {
      if (!routeActive.current) return;
      if (toolsVisible.current || onlineMenuVisible.current || garageVisible.current || challengeMenuVisible.current) return;
      if (event.key.toLowerCase() === 'b') honk(false);
      const key = keyMap[event.key] ?? keyMap[event.key.toLowerCase()];
      if (key) { event.preventDefault(); keyboard.current[key] = false; updatePressed(); }
    };
    const blur = () => { focused.current = false; clearInput(); silenceSound(); };
    const focus = () => { focused.current = true; };
    const visibility = () => { if (document.hidden) blur(); else focus(); };
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur); window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      subscription.remove(); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [clearInput, reset, selectGearing, startTrail, startRace, startChallenge, openChallengeMenu, closeChallengeMenu, leaveChallenge, toggleCamera, openGarage, closeGarage, openOnlineMenu, closeOnlineMenu, unlockSound, silenceSound, honk, openTools, closeTools, updatePressed]);
  useEffect(() => () => { cancelAnimationFrame(animation.current); scene.current?.dispose(); scene.current = null; }, []);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    cancelAnimationFrame(animation.current); scene.current?.dispose();
    try {
      const world = createScene(gl, selectedVehicle.current); scene.current = world;
      world.setReducedGraphics(settingsRef.current.reducedGraphics);
      world.setPreferredColor(preferredColor.current);
      if (lastNetworkState.current) world.setNetworkSnapshot(lastNetworkState.current.snapshot, lastNetworkState.current.sessionId);
      else if (resetLocation.current === 'race') world.startRace();
      else if (course === 'trail') world.startTrail();
      else if (course === 'challenge') {
        const status = world.startChallenge(selectedVehicle.current);
        if (status) { challengeState.current = status; setChallengeStatus(status); }
      }
      setCamera(0);
      let previous = 0; let lastUpdate = 0; let lastHorn = 0;
      const controls = emptyControls();
      const frame = (time: number) => {
        try {
          const dt = previous ? Math.min((time - previous) / 1000, 0.05) : 1 / 60; previous = time;
          if (routeActive.current && running.current && focused.current && (onlineState.current.room || (!garageVisible.current && !onlineMenuVisible.current && !challengeMenuVisible.current))) {
            controlKeys.forEach(key => { controls[key] = false; });
            if (!toolsVisible.current && !garageVisible.current && !onlineMenuVisible.current && !challengeMenuVisible.current) {
              controlKeys.forEach(key => { controls[key] = Boolean(touch.current[key] || keyboard.current[key]); });
            }
            network.current?.setInput(controls, gearingRef.current);
            const pulse = hornPulse.current;
            network.current?.setHorn(pulse?.active ?? false, pulse?.tone ?? 'auto');
            const draw = !toolsVisible.current && !garageVisible.current && !onlineMenuVisible.current && !challengeMenuVisible.current;
            const info = world.frame(dt, controls, gearingRef.current, draw);
            network.current?.enqueueInputs(info.networkInputs);
            // Mixers tick independently. Rebuilding voice lists at 20 Hz is
            // enough for horns; it need not allocate arrays every render frame.
            if (time - lastHorn >= interfaceTiming.hornFrameMs) {
              const hornRemotes = onlineState.current.phase === 'online' && lastNetworkState.current
                ? nearbyHorns(lastNetworkState.current.snapshot, lastNetworkState.current.sessionId) : [];
              updateHorn({ active: focused.current && !garageVisible.current && !onlineMenuVisible.current && !challengeMenuVisible.current && onlineState.current.phase !== 'reconnecting',
                voices: [{ id: 'self', vehicleId: selectedVehicle.current, tone: pulse?.tone ?? 'auto', honking: pulse?.active ?? false, distance: 0, own: true }, ...hornRemotes] });
              lastHorn = time;
            }
            if (time - lastUpdate > interfaceTiming.hudMs) {
              const speed = Math.round(info.speed);
              const reverse = info.reverse;
              setTelemetry(previous => previous.speed === speed && previous.reverse === reverse ? previous : { speed, reverse });
              if (info.challenge.phase === 'finished' && challengeState.current.phase !== 'finished') { toolsVisible.current = false; setToolsOpen(false); }
              const old = challengeState.current;
              if (info.challenge.passed > old.passed && old.phase === 'running') feedback();
              challengeState.current = info.challenge;
              if (info.challenge.phase !== 'idle' || old.phase !== 'idle') setChallengeStatus(info.challenge);
              lastUpdate = time;
              const remote = onlineState.current.phase === 'online' && lastNetworkState.current
                ? nearbyEngines(lastNetworkState.current.snapshot, lastNetworkState.current.sessionId) : [];
              updateSound({
                active: focused.current && !garageVisible.current && !onlineMenuVisible.current && !challengeMenuVisible.current && onlineState.current.phase !== 'reconnecting',
                voices: [{ id: 'self', vehicleId: selectedVehicle.current, speed: info.speed, gearing: gearingRef.current,
                  accelerating: controls.throttle || controls.reverse, braking: controls.brake, distance: 0, own: true }, ...remote],
              });
            }
          }
          animation.current = requestAnimationFrame(frame);
        } catch (cause) { silenceSound(); setError(cause instanceof Error ? cause.message : 'Erro ao desenhar a cena.'); }
      };
      animation.current = requestAnimationFrame(frame); setReady(true);
    } catch (cause) { silenceSound(); setError(cause instanceof Error ? cause.message : 'O dispositivo não conseguiu iniciar o 3D.'); }
  }, [updateSound, updateHorn, silenceSound, feedback, course]);

  const competitionDriving = online.tournament?.phase === 'race' || online.tournament?.phase === 'countdown';
  const vehicleSelectionDisabled = !ready || challengeStatus.phase !== 'idle' || !!online.tournament?.started;
  return <View style={styles.container} onTouchStart={unlockSound} onPointerDown={unlockSound}>
    <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} msaaSamples={4} />
    {camera === 2 && <View style={[StyleSheet.absoluteFill, styles.lookSurface]}
      accessibilityLabel="Arrasta para rodar a câmara livre à volta do veículo"
      {...(Platform.OS === 'web' ? {
        onPointerDown: (event: PointerEvent) => {
          event.preventDefault();
          scene.current?.beginCameraDrag(event.nativeEvent.pointerId, event.nativeEvent.clientX, event.nativeEvent.clientY);
        },
        onPointerMove: (event: PointerEvent) => scene.current?.moveCameraDrag(event.nativeEvent.pointerId, event.nativeEvent.clientX, event.nativeEvent.clientY),
        onPointerUp: (event: PointerEvent) => scene.current?.endCameraDrag(event.nativeEvent.pointerId),
        onPointerCancel: (event: PointerEvent) => scene.current?.endCameraDrag(event.nativeEvent.pointerId),
        onPointerLeave: (event: PointerEvent) => scene.current?.endCameraDrag(event.nativeEvent.pointerId),
      } : {
        onTouchStart: (event: GestureResponderEvent) => {
          const point = event.nativeEvent.changedTouches[0];
          if (point) scene.current?.beginCameraDrag(point.identifier, point.pageX, point.pageY);
        },
        onTouchMove: (event: GestureResponderEvent) => {
          event.nativeEvent.changedTouches.forEach(point => scene.current?.moveCameraDrag(point.identifier, point.pageX, point.pageY));
        },
        onTouchEnd: (event: GestureResponderEvent) => {
          event.nativeEvent.changedTouches.forEach(point => scene.current?.endCameraDrag(point.identifier));
        },
        onTouchCancel: () => scene.current?.cancelCameraDrag(),
      })} />}
    <View pointerEvents="box-none" style={[styles.overlay, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12), paddingLeft: Math.max(insets.left, 12), paddingRight: Math.max(insets.right, 12) }]}>
      <View style={styles.top} pointerEvents="box-none">
        <View style={[styles.identity, compact && styles.raceIdentity]} pointerEvents="auto">
        <View pointerEvents="none">{competitionDriving ? <Text numberOfLines={1} style={styles.eyebrow}>RAMP RIVALS · {vehicles[vehicleId].name}</Text> : <><Text style={styles.eyebrow}>RAMP RIVALS</Text><Text style={[styles.title, challengeStatus.phase !== 'idle' && styles.challengeTitle]}>{challengeStatus.phase !== 'idle' ? 'Desafio da Serra' : location === 'race' ? 'Circuito' : location === 'trail' ? 'Todo-o-terreno' : 'Condução livre'}</Text>{challengeStatus.phase === 'idle' && <View style={styles.badge}><View style={[styles.dot, { backgroundColor: vehicles[vehicleId].color }]} /><Text style={styles.badgeText}>{vehicles[vehicleId].name}</Text></View>}</>}</View>
          {online.room && !(compact && competitionDriving) && <Text selectable style={styles.onlineRoom}>SALA {online.room.code} · {online.room.players.length}/4{online.ping !== null ? ` · ${online.ping} ms` : ''}</Text>}
          {online.phase === 'reconnecting' && <Text accessibilityLiveRegion="polite" style={styles.onlineRoom}>{online.reconnection?.state === 'background' ? 'Ligação suspensa' : online.reconnection?.state === 'lost' ? 'Ligação perdida' : 'Reconexão em curso'} · {online.reconnection?.remainingSeconds ?? 0} s para retomar</Text>}
          {online.reconnection?.state === 'restored' && <Text accessibilityLiveRegion="polite" style={styles.onlineRoom}>Ligação restabelecida · estado recuperado</Text>}
          {online.phase === 'error' && <Text accessibilityLiveRegion="polite" style={styles.onlineRoom}>{online.reconnection?.state === 'expired' ? 'Prazo de reconexão expirado · sessão não recuperada.' : 'Ligação terminada · abre Online para mais informações.'}</Text>}
          <ChallengeHud status={challengeStatus} compact={compact} />
          <CompetitionHud online={online} compact={compact} />
          {!online.tournament?.started && online.room && online.competition && online.competition.phase !== 'idle' && <Text accessibilityLiveRegion="polite" style={styles.onlineRoom}>{online.competition.phase === 'countdown' ? `Partida em ${Math.ceil(online.competition.countdown)}` : online.competition.phase === 'ready' ? 'Atravessa a partida para iniciar o cronómetro' : `Volta: ${(online.competition.elapsedMs / 1000).toFixed(2)} s · ${online.competition.passed}/${online.competition.total}`}{online.competition.message ? ` · ${online.competition.message}` : ''}</Text>}
        </View>
        <View style={styles.toolArea}>
          {!compact && (challengeStatus.phase === 'idle'
            ? <Pressable accessibilityRole="button" accessibilityLabel="Escolher carro para o Desafio da Serra" disabled={!ready || !!online.room} onPress={openChallengeMenu} style={[styles.action, styles.challengeAction, (!ready || !!online.room) && styles.disabled]}><Text style={styles.challengeActionText}>{online.room ? 'Nível · a solo' : 'Jogar nível'}</Text></Pressable>
            : <Pressable accessibilityRole="button" onPress={leaveChallenge} style={styles.action}><Text style={styles.actionText}>Sair do nível</Text></Pressable>)}

          <Pressable accessibilityRole="button" accessibilityLabel={`Mudar câmara. Atual: ${camera + 1} de 3`} onPress={toggleCamera} style={[styles.action, compact && styles.compactAction]}><Text style={styles.actionText}>{compact ? `C${camera + 1}` : ['Traseira', 'Próxima', 'Livre'][camera]}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={challengeStatus.phase === 'running' || online.tournament?.phase === 'race' ? 'Voltar ao último checkpoint com penalização de cinco segundos' : 'Repor carro'} disabled={!ready} onPress={reset} style={[styles.action, compact && styles.compactAction]}><Text style={styles.actionText}>{compact ? online.tournament?.phase === 'race' || challengeStatus.phase === 'running' ? '↺ +5 s' : '↺ Repor' : online.tournament?.phase === 'race' || challengeStatus.phase === 'running' ? '↺ Recuperar +5 s' : '↺ Recuperar'}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir menu, instruções e definições" accessibilityState={{ expanded: toolsOpen }} onPress={openTools} style={[styles.action, compact && styles.compactAction, styles.menuToggle]}><Text style={styles.actionText}>☰ Menu</Text></Pressable>
        </View>
      </View>
      {!ready || error.length > 0 ? (
        <View style={styles.message}>
          <Text style={styles.messageText}>
            {error ? `Não foi possível iniciar o 3D. ${error}` : 'A preparar a pista…'}
          </Text>
        </View>
      ) : null}
      <View style={styles.bottom} pointerEvents="box-none">
        <DrivingControls availableWidth={width - Math.max(insets.left, 12) - Math.max(insets.right, 12)} height={height} preferences={preferences} pressed={pressedControls}
          speed={telemetry.speed} reverse={telemetry.reverse} showAir={true} disabled={!ready || !!error}
          onHold={holdControl} onRelease={releaseControl} onHorn={honk} hornPressed={hornPressed} />
        {!compact && <Text style={styles.hint} pointerEvents="none">{camera === 2 ? 'Arrasta na zona livre para rodar a câmara.' : Platform.OS === 'web' ? 'WASD / setas · Espaço trava · C câmara · R recuperar · Esc menu' : 'Mantém os pedais premidos · Ajusta o tamanho em Menu'}</Text>}
      </View>
    </View>
    <Modal visible={toolsOpen} transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={closeTools}>
      <SafeAreaView style={styles.menuBackdrop}><View style={styles.menuPanel} accessibilityViewIsModal>
        <View style={styles.menuHeader}>
          <View style={styles.menuHeaderCopy}>
            <Text style={styles.menuEyebrow}>RAMP RIVALS</Text>
            <Text accessibilityRole="header" style={styles.menuTitle}>Menu de condução</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={closeTools} style={styles.resumeButton}><Text style={styles.resumeButtonText}>Continuar</Text></Pressable>
        </View>
        <View style={styles.menuTabs}>
          {([
            ['play', 'Jogar'],
            ['controls', 'Controlo'],
            ['settings', 'Definições'],
          ] as const).map(([tab, label]) => <Pressable key={tab} accessibilityRole="button" accessibilityState={{ selected: menuTab === tab }} onPress={() => setMenuTab(tab)} style={[styles.menuTab, menuTab === tab && styles.menuTabSelected]}><Text style={[styles.menuTabText, menuTab === tab && styles.menuTabTextSelected]}>{label}</Text></Pressable>)}
        </View>
        <ScrollView contentContainerStyle={styles.menuContent}>
          {(challengeStatus.phase === 'running' || online.tournament?.phase === 'race') && <View style={styles.statusCard}><View style={styles.statusDot}/><Text style={styles.statusText}>A corrida continua enquanto este menu está aberto.</Text></View>}
          {menuTab === 'play' && <>
            <Text style={styles.menuSection}>Ações rápidas</Text>
            <View style={styles.actionGrid}>
              <Pressable accessibilityRole="button" disabled={!ready} onPress={() => { closeTools(); openOnlineMenu(); }} style={styles.primaryAction}><Text style={styles.primaryActionIcon}>◎</Text><View style={styles.primaryActionCopy}><Text style={styles.primaryActionTitle}>{online.room ? 'Online' : 'Modo online'}</Text><Text style={styles.primaryActionMeta}>{online.room ? 'Sala e competição' : 'Criar ou entrar'}</Text></View><Text style={styles.primaryActionChevron}>›</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={vehicleSelectionDisabled} onPress={() => { closeTools(); openGarage(); }} style={[styles.primaryAction, vehicleSelectionDisabled && styles.disabled]}><Text style={styles.primaryActionIcon}>▱</Text><View style={styles.primaryActionCopy}><Text style={styles.primaryActionTitle}>Veículo</Text><Text style={styles.primaryActionMeta}>{vehicles[vehicleId].name}</Text></View><Text style={styles.primaryActionChevron}>›</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={!ready || !!online.room || challengeStatus.phase !== 'idle'} onPress={() => { closeTools(); startRace(); }} style={[styles.primaryAction, (!ready || !!online.room || challengeStatus.phase !== 'idle') && styles.disabled]}><Text style={styles.primaryActionIcon}>◉</Text><View style={styles.primaryActionCopy}><Text style={styles.primaryActionTitle}>Circuito</Text><Text style={styles.primaryActionMeta}>Corrida fechada</Text></View><Text style={styles.primaryActionChevron}>›</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={!ready || !!online.room || challengeStatus.phase !== 'idle'} onPress={() => { closeTools(); startTrail(); }} style={[styles.primaryAction, (!ready || !!online.room || challengeStatus.phase !== 'idle') && styles.disabled]}><Text style={styles.primaryActionIcon}>△</Text><View style={styles.primaryActionCopy}><Text style={styles.primaryActionTitle}>Todo-o-terreno</Text><Text style={styles.primaryActionMeta}>Condução livre</Text></View><Text style={styles.primaryActionChevron}>›</Text></Pressable>
            </View>
            <Text style={styles.menuSection}>Mais opções</Text>
            <View style={styles.optionRow}>
              <Pressable accessibilityRole="button" disabled={!ready || !!online.room} onPress={() => { closeTools(); openChallengeMenu(); }} style={[styles.menuOption, (!ready || !!online.room) && styles.disabled]}><Text style={styles.actionText}>Desafio da Serra</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => { closeTools(); silenceSound(); router.push('/account'); }} style={styles.menuOption}><Text style={styles.actionText}>{auth.session ? 'A minha conta' : 'Entrar / Registar'}</Text></Pressable>
            </View>
            {challengeStatus.phase !== 'idle' && <Pressable accessibilityRole="button" onPress={() => { closeTools(); leaveChallenge(); }} style={[styles.menuOption, styles.neutralAction]}><Text style={styles.actionText}>Sair do desafio · condução livre</Text></Pressable>}
            <Pressable accessibilityRole="button" onPress={() => { closeTools(); network.current?.leave(); if (router.canGoBack()) router.back(); else router.replace('/'); }} style={[styles.menuOption, styles.dangerAction]}><Text style={styles.dangerText}>Sair para o menu principal</Text></Pressable>
          </>}
          {menuTab === 'controls' && <>
            <Text style={styles.menuSection}>Tamanho dos botões</Text>
            <View style={styles.optionRow}>{(['normal', 'large'] as const).map(size => <Pressable key={size} accessibilityRole="button" accessibilityState={{ selected: preferences.size === size }} onPress={() => { clearInput(); updatePreferences({ ...preferences, size }); }} style={[styles.menuOption, preferences.size === size && styles.optionSelected]}><Text style={styles.actionText}>{size === 'normal' ? 'Confortável' : 'Maiores'}</Text></Pressable>)}</View>
            <Pressable accessibilityRole="switch" accessibilityLabel="Trocar lados da direção e dos pedais" accessibilityState={{ checked: preferences.swapped }} onPress={() => { clearInput(); updatePreferences({ ...preferences, swapped: !preferences.swapped }); }} style={styles.settingRow}>
              <View style={styles.settingCopy}><Text style={styles.settingTitle}>Posição dos comandos</Text><Text style={styles.settingMeta}>{preferences.swapped ? 'Direção à direita · pedais à esquerda' : 'Direção à esquerda · pedais à direita'}</Text></View><Text style={styles.settingValue}>{preferences.swapped ? '✓' : '⇄'}</Text>
            </Pressable>
            {!controlsSaved && <Text style={styles.menuHelp}>Esta preferência só está ativa nesta sessão.</Text>}
            <View style={styles.helpCard}><Text style={styles.helpTitle}>Como conduzir</Text><ModeInstructions /></View>
            {Platform.OS === 'web' && <View style={styles.helpCard}><Text style={styles.helpTitle}>Teclado</Text><Text style={styles.menuHelp}>WASD / setas: conduzir · Espaço: travar · Q/E: rodar no ar · B: buzina · C: câmara · R: recuperar · Esc: menu</Text></View>}
          </>}
          {menuTab === 'settings' && <>
            <Text style={styles.menuSection}>Experiência</Text>
            <Pressable accessibilityRole="switch" accessibilityLabel="Som dos motores e buzinas" accessibilityState={{ checked: settings.sound, disabled: !settingsLoaded }} disabled={!settingsLoaded} onPress={() => { unlockSound(); void updateSettings({ sound: !settings.sound }); }} style={styles.settingRow}>
              <View style={styles.settingCopy}><Text style={styles.settingTitle}>Som</Text><Text style={styles.settingMeta}>Motores e buzina</Text></View><Text style={[styles.settingValue, settings.sound && styles.settingValueActive]}>{settings.sound ? 'Ligado' : 'Desligado'}</Text>
            </Pressable>
            <Pressable accessibilityRole="switch" accessibilityLabel="Vibração" accessibilityState={{ checked: settings.vibration, disabled: !settingsLoaded }} disabled={!settingsLoaded} onPress={() => { void updateSettings({ vibration: !settings.vibration }); }} style={styles.settingRow}>
              <View style={styles.settingCopy}><Text style={styles.settingTitle}>Vibração</Text><Text style={styles.settingMeta}>Recuperação e checkpoints</Text></View><Text style={[styles.settingValue, settings.vibration && styles.settingValueActive]}>{settings.vibration ? 'Ligada' : 'Desligada'}</Text>
            </Pressable>
            <Pressable accessibilityRole="switch" accessibilityLabel="Qualidade gráfica reduzida" accessibilityState={{ checked: settings.reducedGraphics, disabled: !settingsLoaded }} disabled={!settingsLoaded} onPress={() => { clearInput(); void updateSettings({ reducedGraphics: !settings.reducedGraphics }); }} style={styles.settingRow}>
              <View style={styles.settingCopy}><Text style={styles.settingTitle}>Qualidade</Text><Text style={styles.settingMeta}>{settings.reducedGraphics ? 'Reduzida · melhor desempenho' : 'Normal · sombras e efeitos'}</Text></View><Text style={[styles.settingValue, settings.reducedGraphics && styles.settingValueActive]}>{settings.reducedGraphics ? 'Eco' : 'Normal'}</Text>
            </Pressable>
            {!settingsLoaded && <Text style={styles.menuHelp}>A carregar definições…</Text>}
            {!settingsSaved && <Text accessibilityLiveRegion="polite" style={styles.menuHelp}>Aplicadas nesta sessão. Não foi possível guardar no dispositivo.</Text>}
          </>}
        </ScrollView>
      </View></SafeAreaView>
    </Modal>
    <ChallengeOverlay status={challengeStatus} onReplay={() => startChallenge(challengeStatus.vehicleId)} onLeave={leaveChallenge} onChooseCar={openChallengeMenu} />
    <ChallengeMenu visible={challengeMenuOpen} selected={challengeVehicle} bestByVehicle={challengeStatus.bestByVehicle} onSelect={setChallengeVehicle} onStart={startChallenge} onClose={closeChallengeMenu} />
    <VehicleGarage visible={garageOpen} current={vehicleId} onClose={closeGarage} onTest={testVehicle} />
    <OnlineMenu visible={onlineMenuOpen} status={online} onClose={closeOnlineMenu}
      onTournament={action => { clearInput(); network.current?.tournament(action); }}
      onPurchase={action => { clearInput(); network.current?.purchase(action); }}
      onVehicle={id => { clearInput(); network.current?.selectVehicle(id, 'garage'); }}
      onCompetition={action => { clearInput(); network.current?.competition(action); if (action === 'start') closeOnlineMenu(); }}
      onLeave={() => { clearInput(); network.current?.leave(); }}
      onConnect={options => { clearInput(); void network.current?.connect({ ...options, vehicleId: selectedVehicle.current, getAccessToken: auth.getAccessToken }); }} />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ui.background },
  // React Native Web supports touchAction, which is absent from native ViewStyle.
  lookSurface: { touchAction: 'none' } as ViewStyle & { touchAction: 'none' },
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  identity: { backgroundColor: ui.overlay, padding: 12, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: ui.accent, flexShrink: 1, maxWidth: '48%' },
  raceIdentity: { padding: 8 },
  eyebrow: { color: ui.muted, fontSize: 10, fontWeight: '600', letterSpacing: 1.5 },
  title: { color: ui.text, fontSize: 18, fontWeight: '600', marginTop: 4 },
  challengeTitle: { fontSize: 18 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  dot: { width: 7, height: 7, borderRadius: 2 },
  badgeText: { color: ui.muted, fontSize: 12, flexShrink: 1 },
  onlineRoom: { color: ui.accent, fontSize: 12, fontWeight: '600', marginTop: 5 },
  toolArea: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '49%', gap: 8 },
  menuToggle: { borderColor: ui.accent },
  action: { minHeight: 48, minWidth: 78, justifyContent: 'center', alignItems: 'center', backgroundColor: ui.overlay, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#647078' },
  compactAction: { minWidth: 56, paddingHorizontal: 8 },
  actionText: { color: ui.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: .45 },
  challengeAction: { backgroundColor: ui.accent, borderColor: ui.accent },
  challengeActionText: { color: ui.ink, fontSize: 12, fontWeight: '700' },
  bottom: { gap: 10 },
  hint: { alignSelf: 'center', textAlign: 'center', fontSize: 11, lineHeight: 16, color: ui.text, backgroundColor: ui.overlay, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '100%' },
  message: { alignSelf: 'center', backgroundColor: ui.surface, borderRadius: 8, padding: 20, maxWidth: 350, borderWidth: 1, borderColor: ui.border },
  messageText: { color: ui.text, textAlign: 'center', lineHeight: 20 },
  menuBackdrop: { flex: 1, backgroundColor: '#080b0de8', justifyContent: 'center', alignItems: 'center', padding: 12 },
  menuPanel: { width: '100%', maxWidth: 720, maxHeight: '92%', backgroundColor: '#171b1f', borderRadius: 18, borderWidth: 1, borderColor: '#39434a', overflow: 'hidden', flexShrink: 1 },
  menuHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderColor: '#30383d' },
  menuHeaderCopy: { flexShrink: 1 },
  menuEyebrow: { color: ui.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1.8, marginBottom: 2 },
  menuTitle: { color: ui.text, fontSize: 21, fontWeight: '800', flexShrink: 1 },
  resumeButton: { minHeight: 48, minWidth: 104, borderRadius: 10, backgroundColor: ui.accent, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  resumeButtonText: { color: ui.ink, fontSize: 14, fontWeight: '800' },
  menuTabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },
  menuTab: { flex: 1, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: '#39434a', backgroundColor: '#20262a', justifyContent: 'center', alignItems: 'center' },
  menuTabSelected: { backgroundColor: '#30383d', borderColor: ui.accent },
  menuTabText: { color: ui.muted, fontSize: 12, fontWeight: '700' },
  menuTabTextSelected: { color: ui.text },
  menuContent: { padding: 16, gap: 12 },
  menuSection: { color: ui.text, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  menuOption: { flexGrow: 1, flexBasis: '45%', minHeight: 56, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#39434a', backgroundColor: '#242b30', justifyContent: 'center' },
  optionSelected: { borderColor: ui.accent, borderWidth: 2, backgroundColor: '#30383d' },
  menuHelp: { color: ui.muted, fontSize: 13, lineHeight: 20 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 48, borderRadius: 10, backgroundColor: '#252e31', borderLeftWidth: 3, borderLeftColor: ui.accent, paddingHorizontal: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ui.accent },
  statusText: { color: ui.text, flex: 1, fontSize: 12, lineHeight: 18 },
  actionGrid: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#39434a' },
  primaryAction: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: '#39434a', backgroundColor: 'transparent', paddingHorizontal: 6, paddingVertical: 8 },
  primaryActionIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#465159', color: ui.accent, fontSize: 18, lineHeight: 36, textAlign: 'center', fontWeight: '800' },
  primaryActionCopy: { flex: 1 },
  primaryActionTitle: { color: ui.text, fontSize: 15, fontWeight: '800' },
  primaryActionMeta: { color: ui.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  primaryActionChevron: { color: ui.muted, fontSize: 24, fontWeight: '600' },
  neutralAction: { borderColor: '#465159' },
  dangerAction: { borderColor: '#70423e', backgroundColor: '#302423' },
  dangerText: { color: '#f3b9ad', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  settingRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, borderColor: '#39434a', backgroundColor: '#242b30', paddingHorizontal: 14, paddingVertical: 10 },
  settingCopy: { flex: 1 },
  settingTitle: { color: ui.text, fontSize: 14, fontWeight: '800' },
  settingMeta: { color: ui.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  settingValue: { minWidth: 58, textAlign: 'center', color: ui.muted, fontSize: 12, fontWeight: '800', backgroundColor: '#171b1f', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8 },
  settingValueActive: { color: ui.ink, backgroundColor: ui.accent },
  helpCard: { gap: 6, borderRadius: 12, borderWidth: 1, borderColor: '#39434a', backgroundColor: '#20262a', padding: 14 },
  helpTitle: { color: ui.text, fontSize: 13, fontWeight: '800' },
});
