from django.db import models
from django.conf import settings

class ChatRooms(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=30)
    user_chat_rooms = models.ManyToManyField(settings.AUTH_USER_MODEL, through='UserChatRooms', related_name='chat_rooms')


class ChatMessage(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    chatroom = models.ForeignKey(ChatRooms, on_delete=models.CASCADE)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)


# User와 ChatRooms의 중개테이블
class UserChatRooms(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    chatroom = models.ForeignKey(ChatRooms, on_delete=models.CASCADE)
    is_presenter = models.PositiveSmallIntegerField(default=0)