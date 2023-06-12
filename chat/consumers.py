import json
import asyncio

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import ChatMessage, ChatRooms, UserChatRooms

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = "chat_%s" % self.room_name
        self.room = await self.get_room()

        # Join room group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()

        # 이전 채팅내역 클라이언트로 전송
        await self.send_existing_chat_messages()


        # 입장 메시지 전송
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "system_message",
                "message": f"{self.scope['user'].username}님이 입장하셨습니다."
            }
        )

        # 채팅방에 현재 유저 추가
        await self.add_user_to_chat_room()

        async def send_user_list(self, event):
            user_list = event['user_list']
            await self.send(text_data=json.dumps({
                "user_list": user_list,
                "now": "user_list"
            }))


    @database_sync_to_async
    def get_room(self):
        return ChatRooms.objects.get(title=self.room_name)
    

    # db에서 해당 채팅방의 이전 메시지들 가져옴
    @database_sync_to_async
    def get_existing_chat_messages(self):
        return ChatMessage.objects.filter(chatroom=self.room).order_by("timestamp")


    # 가져온 이전 채팅 내용을 클라이언트로 전송
    async def send_existing_chat_messages(self):
        # Get existing chat messages for the room from the database
        chat_messages = await self.get_existing_chat_messages()

        # Send each chat message to the user
        for chat_message in chat_messages:
            await self.send(text_data=json.dumps({
                "message": chat_message.content,
                "user": chat_message.user.username,
                "now": 'chat',
            }))


    # 유저 입장메시지 전송
    async def system_message(self, event):
        message = event['message']
        await self.send(text_data=json.dumps({
            "message": message,
            "user": "System",
            "now": 'chat',
        }))


    async def disconnect(self, close_code):
        # 퇴장 메시지 전송
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "system_message",
                "message": f"{self.scope['user'].username}님이 퇴장하셨습니다."
            }
        )

        # 채팅방에서 현재 유저 제거
        await self.remove_user_from_chat_room()

        # Leave room group
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)


    # 유저 목록 업데이트
    async def update_user_list(self):
        user_list = await self.get_user_list()

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "send_user_list",
                "user_list": user_list,
            }
        )


    # 채팅방에 현재 유저 추가
    # @database_sync_to_async
    async def add_user_to_chat_room(self):
        user_chat_room, created = UserChatRooms.objects.get_or_create(
            user=self.scope['user'],
            chatroom=self.room
        )

        if created:
            if self.room.user_chat_rooms.count() == 1:
                user_chat_room.is_presenter = 1
            await self.update_user_list()
            await database_sync_to_async(user_chat_room.save)()

        if user_chat_room:
            await self.update_user_list()


    # 채팅방에서 현재 유저 제거
    # @database_sync_to_async
    async def remove_user_from_chat_room(self):
        user = self.scope['user']

        UserChatRooms.objects.filter(user=user, chatroom=self.room).delete()

        remaining_user_count = UserChatRooms.objects.filter(chatroom=self.room).count()

        if remaining_user_count == 1:
            remaining_user_chat_room = UserChatRooms.objects.filter(chatroom=self.room).first()
            remaining_user_chat_room.is_presenter = 1
            remaining_user_chat_room.save()

        await self.update_user_list()


    # 유저 목록 가져오기
    @database_sync_to_async
    def get_user_list(self):
        user_list = UserChatRooms.objects.filter(chatroom=self.room).values_list('user__username', flat=True)
        return list(user_list)


    # Receive message from WebSocket
    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        now = text_data_json["now"]
        user = self.scope['user']

        if now == 'chat':
        # Send message to room group
            message = text_data_json["message"]

            await self.save_chat_message(user, message)

            await self.channel_layer.group_send(
                self.room_group_name, {
                    "type": "chat_message", 
                    "message": message,
                    "user": user,
                }
            )
        elif now == 'draw':
            x = text_data_json['x']
            y = text_data_json['y']
            colorValue = text_data_json['colorValue']
            sizeValue = text_data_json['sizeValue']
            await self.channel_layer.group_send(
                self.room_group_name, {
                    "type": "draw_message", 
                    "x": x,
                    "y": y,
                    "colorValue": colorValue,
                    "sizeValue": sizeValue,
                    "user": user,
                }
            )
        elif now == 'start':
            x = text_data_json['x']
            y = text_data_json['y']
            await self.channel_layer.group_send(
                self.room_group_name, {
                    "type": "start_message", 
                    "x": x,
                    "y": y,
                    "user": user,
                }
            )
        elif now == 'eraser':
            x = text_data_json['x']
            y = text_data_json['y']
            colorValue = text_data_json['colorValue']
            sizeValue = text_data_json['sizeValue']
            await self.channel_layer.group_send(
                self.room_group_name, {
                    "type": "erase_message", 
                    "x": x,
                    "y": y,
                    "colorValue": colorValue,
                    "sizeValue": sizeValue,
                    "user": user,
                }
            )

        elif now == 'eraseAll':
            await self.channel_layer.group_send(
                self.room_group_name, {
                    "type": "erase_all_message", 
                }
            )
        elif now == 'position':
            x = text_data_json['x']
            y = text_data_json['y']
            await self.channel_layer.group_send(
                self.room_group_name, {
                    "type": "position_message", 
                    "x": x,
                    "y": y,
                    "user": user,
                }
            )
        elif now == 'new-peer':         
            text_data_json['user'] = user.username
            text_data_json['message']['receiver_channel_name'] = self.channel_name   
            await self.channel_layer.group_send(
                self.room_group_name, {
                    'type': 'send_sdp', 
                    'receive_dict': text_data_json,
                }
            )
        elif now == 'new-offer' or now == 'new-answer':
            text_data_json['user'] = user.username
            receiver_channel_name = text_data_json['message']['receiver_channel_name']
            text_data_json['message']['receiver_channel_name'] = self.channel_name 
            await self.channel_layer.send(
                receiver_channel_name, {
                    'type': 'send_sdp',
                    'receive_dict': text_data_json,
                }
            )


    # 받은 메시지 db에 저장, 비동기적으로 작업 수행
    @database_sync_to_async
    def save_chat_message(self, user, message):
        chat_message = ChatMessage(user=user, content=message, chatroom=self.room)
        chat_message.save()


    # Receive message from room group
    async def chat_message(self, event):
        message = event["message"]
        user = event["user"].username
        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            "message": message,
            "user": user,
            "now": 'chat',
            })
        )
    

    # 그림 좌표 클라이언트로 전송
    async def draw_message(self, event):
        x = event['x']
        y = event['y']
        colorValue = event['colorValue']
        sizeValue = event['sizeValue']
        user = event['user'].username
        await self.send(text_data=json.dumps({
            'x': x,
            'y': y,
            'colorValue': colorValue,
            'sizeValue': sizeValue,
            "user": user,
            'now': 'draw',
        }))


    # 그림과 같지만 now만 eraser로 보내고 클라에서 처리
    async def erase_message(self, event):
        x = event['x']
        y = event['y']
        colorValue = event['colorValue']
        sizeValue = event['sizeValue']
        user = event['user'].username
        await self.send(text_data=json.dumps({
            'x': x,
            'y': y,
            "colorValue": colorValue,
            "sizeValue": sizeValue,
            "user": user,
            'now': 'eraser',
        }))


    # 그림 시작 좌표 클라로 전송
    async def start_message(self, event):
        x = event['x']
        y = event['y']
        user = event['user'].username
        await self.send(text_data=json.dumps({
            'x': x,
            'y': y,
            "user": user,
            'now': 'start',
        }))


    # 그림 전체삭제 호출 정보 클라로 전송
    async def erase_all_message(self, event):
        await self.send(text_data=json.dumps({
            'now': 'eraseAll',
        }))


    # 마우스 위치 전송 (피그잼 마우스 위치 공유)
    async def position_message(self, event):
        x = event['x']
        y = event['y']
        user = event['user'].username
        await self.send(text_data=json.dumps({
            'x': x,
            'y': y,
            "user": user,
            'now': 'position',
        }))
        
        
    # RTCSessionDescription을 원하는 receiver_channel_name에 송신
    async def send_sdp(self, event):
        receive_dict = event['receive_dict']
        await self.send(text_data=json.dumps(receive_dict))

    
    # 유저 목록 전송
    async def send_user_list(self, event):
        user_list = event['user_list']
        await self.send(text_data=json.dumps({
            "user_list": user_list,
            "now": "user_list"
        }))