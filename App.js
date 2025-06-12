/* eslint-disable react-native/no-inline-styles */
import React, {useState, useRef} from 'react';
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
  RTCView,
} from '@videosdk.live/react-native-sdk';
import {createMeeting, token} from './api';
import {NativeModules} from 'react-native';
import {VideoProcessor} from '@videosdk.live/react-native-webrtc';
const { VideoEffectModule, PiPManager, RemoteTrackModule } = NativeModules;

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
        style={{backgroundColor: '#1178F8', padding: 12, borderRadius: 6}}>
        <Text style={{color: 'white', alignSelf: 'center', fontSize: 18}}>
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
        <Text style={{color: 'white', alignSelf: 'center', fontSize: 18}}>
          Join Meeting
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const Button = ({onPress, buttonText, backgroundColor}) => {
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
      <Text style={{color: 'white', fontSize: 12}}>{buttonText}</Text>
    </TouchableOpacity>
  );
};

function register() {
  VideoEffectModule.registerProcessor('VideoProcessor');
}

function applyProcessor() {
  VideoProcessor.applyVideoProcessor('VideoProcessor');
}

function ControlsContainer({join, leave, toggleWebcam, toggleMic}) {
  return (
    <View
      style={{
        padding: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
      }}>
      <View style={{flex: 1, gap: 12}}>
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
      <View style={{gap: 12}}>
        <Button
          onPress={() => {
            register();
            applyProcessor();
            PiPManager.setupPiP();
          }}
          buttonText={'Apply Processor'}
          backgroundColor={'#1178F8'}
        />
        <Button
          onPress={() => {
            PiPManager.startPiP();
          }}
          buttonText={'PiP'}
          backgroundColor={'#1178F8'}
        />
      </View>
    </View>
  );
}

function ParticipantView({
  participantId,
  pipedParticipantRef,
  setWebcamStatusMap,
}) {
  const { localParticipant } = useMeeting();
  const {webcamStream, webcamOn} = useParticipant(participantId, {
    onStreamEnabled: stream => {
      setWebcamStatusMap(prev => ({...prev, [participantId]: true}));

      const trackId = stream.track.id;

      // Automatically assign to PiP if no one is set
      if (
        !pipedParticipantRef.current &&
        participantId !== localParticipant.id
      ) {
        pipedParticipantRef.current = participantId;
        RemoteTrackModule.attachRenderer(trackId);
        PiPManager.setShowRemote(true);
      } else if (participantId === pipedParticipantRef.current) {
        RemoteTrackModule.attachRenderer(trackId);
        PiPManager.setShowRemote(true);
      }
    },

    onStreamDisabled: () => {
      setWebcamStatusMap(prev => {
        const updated = {...prev, [participantId]: false};

        if (participantId === pipedParticipantRef.current) {
          const nextPiped = Object.entries(updated).find(
            ([id, isOn]) =>
              id !== localParticipant.id && id !== participantId && isOn,
          );

          if (nextPiped) {
            pipedParticipantRef.current = nextPiped[0];
            PiPManager.setShowRemote(true);
          } else {
            pipedParticipantRef.current = null;
            PiPManager.setShowRemote(false);
          }
        }

        return updated;
      });
    },
  });

  return webcamOn && webcamStream ? (
    <RTCView
      streamURL={new MediaStream([webcamStream.track]).toURL()}
      objectFit={'cover'}
      style={{height: 300, marginVertical: 8, marginHorizontal: 8}}
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
      <Text style={{fontSize: 16}}>NO MEDIA</Text>
    </View>
  );
}

function ParticipantList({
  participants,
  pipedParticipantRef,
  setWebcamStatusMap,
}) {
  return participants.length > 0 ? (
    <FlatList
      data={participants}
      renderItem={({item}) => (
        <ParticipantView
          participantId={item}
          pipedParticipantRef={pipedParticipantRef}
          setWebcamStatusMap={setWebcamStatusMap}
        />
      )}
    />
  ) : (
    <View
      style={{
        flex: 1,
        backgroundColor: '#F6F6FF',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      <Text style={{fontSize: 20}}>Press Join button to enter meeting.</Text>
    </View>
  );
}

function MeetingView() {
  const pipedParticipantRef = useRef(null);
  const [webcamStatusMap, setWebcamStatusMap] = useState({});

  const {
    join,
    leave,
    toggleWebcam,
    toggleMic,
    participants,
    meetingId,
    localParticipant,
  } = useMeeting({
    onParticipantJoined: participant => {
      if (
        participant.id !== localParticipant.id &&
        !pipedParticipantRef.current
      ) {
        pipedParticipantRef.current = participant.id;
      }
    },
    onParticipantLeft: participant => {
      if (participant.id === pipedParticipantRef.current) {
        const remaining = [...participants.keys()].filter(
          id => id !== localParticipant.id && id !== participant.id,
        );

        const activeId = remaining.find(id => webcamStatusMap[id] === true);

        pipedParticipantRef.current = activeId || null;
        PiPManager.setShowRemote(!!activeId);
      }
      // Cleanup from webcamStatusMap
      setWebcamStatusMap(prev => {
        const updated = {...prev};
        delete updated[participant.id];
        return updated;
      });
    },
  });

  const participantsArrId = [...participants.keys()];

  return (
    <View style={{flex: 1}}>
      {meetingId && (
        <Text style={{fontSize: 18, padding: 12}}>
          Meeting Id : {meetingId}
        </Text>
      )}
      <ParticipantList
        participants={participantsArrId}
        pipedParticipantRef={pipedParticipantRef}
        setWebcamStatusMap={setWebcamStatusMap}
      />
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

  const getMeetingId = async id => {
    if (!token) {
      console.log('PLEASE PROVIDE TOKEN IN api.js FROM app.videosdk.live');
    }
    const meetingId = id == null ? await createMeeting({token}) : id;
    setMeetingId(meetingId);
  };

  return meetingId ? (
    <SafeAreaView style={{flex: 1, backgroundColor: '#F6F6FF'}}>
      <MeetingProvider
        config={{
          meetingId,
          micEnabled: true,
          webcamEnabled: true,
          name: 'Test User',
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
