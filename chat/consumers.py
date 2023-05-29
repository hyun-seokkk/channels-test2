import json

from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import ChatMessage, ChatRooms

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = "chat_%s" % self.room_name
        self.room = await self.get_room()

        # Join room group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()

        await self.send_existing_chat_messages()


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


    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    # Receive message from WebSocket
    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        now = text_data_json["now"]
        user = self.scope['user']

        if now == 'chat':
        # Send message to room group
            message = text_data_json["message"]

            print(1, text_data_json)
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
            await self.channel_layer.group_send(
                self.room_group_name, {
                    "type": "draw_message", 
                    "x": x,
                    "y": y,
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


    # 받은 메시지 db에 저장, 비동기적으로 작업 수행
    @database_sync_to_async
    def save_chat_message(self, user, message):
        chat_message = ChatMessage(user=user, content=message, chatroom=self.room)
        chat_message.save()


    # Receive message from room group
    async def chat_message(self, event):
        message = event["message"]
        user = event["user"]
        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            "message": message,
            "user": user,
            "now": 'chat',
            })
        )
    
    async def draw_message(self, event):
        x = event['x']
        y = event['y']
        user = event['user']
        await self.send(text_data=json.dumps({
            'x': x,
            'y': y,
            "user": user,
            'now': 'draw',
        }))


    async def start_message(self, event):
        x = event['x']
        y = event['y']
        user = event['user']
        await self.send(text_data=json.dumps({
            'x': x,
            'y': y,
            "user": user,
            'now': 'start',
        }))