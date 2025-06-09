/* eslint-disable react-native/no-inline-styles */
import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  TouchableOpacity,
  Text,
  TextInput,
  View,
  FlatList,
} from 'react-native';
import {
  MeetingProvider,
  useMeeting,
  useParticipant,
  MediaStream,
  createCameraVideoTrack,
  RTCView,
} from '@videosdk.live/react-native-sdk';
import { createMeeting, token } from './api';
import { NativeModules } from 'react-native';
import {
  VideoProcessor,
} from '@videosdk.live/react-native-webrtc';

function JoinScreen(props) {
  const [meetingVal, setMeetingVal] = useState('');
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: '#F6F6FF',
        justifyContent: 'center',
        paddingHorizontal: 6 * 10,
      }}>
      <TouchableOpacity
        onPress={() => {
          props.getMeetingId();
        }}
        style={{ backgroundColor: '#1178F8', padding: 12, borderRadius: 6 }}>
        <Text style={{ color: 'white', alignSelf: 'center', fontSize: 18 }}>
          Create Meeting
        </Text>
      </TouchableOpacity>

      <Text
        style={{
          alignSelf: 'center',
          fontSize: 22,
          marginVertical: 16,
          fontStyle: 'italic',
          color: 'grey',
        }}>
        ---------- OR ----------
      </Text>
      <TextInput
        value={meetingVal}
        onChangeText={setMeetingVal}
        placeholder={'XXXX-XXXX-XXXX'}
        style={{
          padding: 12,
          borderWidth: 1,
          borderRadius: 6,
          fontStyle: 'italic',
        }}
      />
      <TouchableOpacity
        style={{
          backgroundColor: '#1178F8',
          padding: 12,
          marginTop: 14,
          borderRadius: 6,
        }}
        onPress={() => {
          console.log('dmeo user ');
          props.getMeetingId(meetingVal);
        }}>
        <Text style={{ color: 'white', alignSelf: 'center', fontSize: 18 }}>
          Join Meeting
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const Button = ({ onPress, buttonText, backgroundColor }) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: backgroundColor,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 12,
        borderRadius: 4,
      }}>
      <Text style={{ color: 'white', fontSize: 12 }}>{buttonText}</Text>
    </TouchableOpacity>
  );
};

const { VideoEffectModule } = NativeModules;

function register() {
  VideoEffectModule.registerProcessor('VideoProcessor');
}

function applyProcessor() {
  VideoProcessor.applyVideoProcessor('VideoProcessor');
}

const { PiPManager } = NativeModules;

function ControlsContainer({ join, leave, toggleWebcam, toggleMic }) {
  return (
    <View
      style={{
        padding: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
      }}>
      <View style={{ flex: 1, gap: 12 }}>
        <Button
          onPress={() => {
            join();
          }}
          buttonText={'Join'}
          backgroundColor={'#1178F8'}
        />
        <Button
          onPress={() => {
            toggleWebcam();
          }}
          buttonText={'Toggle Webcam'}
          backgroundColor={'#1178F8'}
        />
        <Button
          onPress={() => {
            toggleMic();
          }}
          buttonText={'Toggle Mic'}
          backgroundColor={'#1178F8'}
        />
        <Button
          onPress={() => {
            leave();
          }}
          buttonText={'Leave'}
          backgroundColor={'#FF0000'}
        />
      </View>

      <Button
        onPress={() => {
          register();
          applyProcessor();
        }}
        buttonText={'Apply Processor'}
        backgroundColor={'#1178F8'}
      />
      <Button
        onPress={() => {
          PiPManager.setupPiP();   // call when initializing PiP
          PiPManager.startPiP();   // call to start PiP mode
        }}
        buttonText={'PiP'}
        backgroundColor={'#1178F8'}
      />
    </View>
  );
}

function onStreamEnabled(stream) {
  const trackId = stream.track.id;
  console.log('Stream enabled for track:', trackId);
  NativeModules.RemoteTrackModule.attachRenderer(trackId);
}

function ParticipantView({ participantId }) {
  const { localParticipant } = useMeeting();
  const { webcamStream, webcamOn } = useParticipant(participantId, {
    onStreamEnabled: participantId === localParticipant.id ? undefined : onStreamEnabled,
  });
  return webcamOn && webcamStream ? (
    <RTCView
      streamURL={new MediaStream([webcamStream.track]).toURL()}
      objectFit={'cover'}
      style={{
        height: 300,
        marginVertical: 8,
        marginHorizontal: 8,
      }}
    />
  ) : (
    <View
      style={{
        backgroundColor: 'grey',
        height: 300,
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: 8,
        marginHorizontal: 8,
      }}>
      <Text style={{ fontSize: 16 }}>NO MEDIA</Text>
    </View>
  );
}

function ParticipantList({ participants }) {
  return participants.length > 0 ? (
    <FlatList
      data={participants}
      renderItem={({ item }) => {
        return <ParticipantView participantId={item} />;
      }}
    />
  ) : (
    <View
      style={{
        flex: 1,
        backgroundColor: '#F6F6FF',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      <Text style={{ fontSize: 20 }}>Press Join button to enter meeting.</Text>
    </View>
  );
}

function MeetingView() {
  // Get `participants` from useMeeting Hook
  const { join, leave, toggleWebcam, toggleMic, participants, meetingId } = useMeeting({});
  const participantsArrId = [...participants.keys()];

  return (
    <View style={{ flex: 1 }}>
      {meetingId ? (
        <Text style={{ fontSize: 18, padding: 12 }}>Meeting Id :{meetingId}</Text>
      ) : null}
      <ParticipantList participants={participantsArrId} />
      <ControlsContainer
        join={join}
        leave={leave}
        toggleWebcam={toggleWebcam}
        toggleMic={toggleMic}
      />
    </View>
  );
}

export default function App() {
  const [meetingId, setMeetingId] = useState(null);


  const getTrack = async () => {
    const track = await createCameraVideoTrack({
      optimizationMode: "motion",
      encoderConfig: "h720p_w960p",
      facingMode: "user",
    });
    setCustomTrack(track);
  };

  let [customTrack, setCustomTrack] = useState();

  useEffect(() => {
    getTrack();
  }, []);

  const getMeetingId = async id => {
    if (!token) {
      console.log('PLEASE PROVIDE TOKEN IN api.js FROM app.videosdk.live');
    }
    const meetingId = id == null ? await createMeeting({ token }) : id;
    setMeetingId(meetingId);
  };

  return meetingId ? (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F6FF' }}>
      <MeetingProvider
        config={{
          meetingId,
          micEnabled: false,
          webcamEnabled: true,
          name: 'Test User',
          customCameraVideoTrack: customTrack,
        }}
        token={token}>
        <MeetingView />
      </MeetingProvider>
    </SafeAreaView>
  ) : (
    <JoinScreen
      getMeetingId={() => {
        getMeetingId();
      }}
    />
  );
}
