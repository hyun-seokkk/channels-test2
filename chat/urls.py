from django.urls import path
from . import views

app_name = 'chat'
urlpatterns = [
    path("", views.index, name="index"),
    path("room/create/", views.create, name="create"),
    path("<str:room_name>/", views.room, name="room"),
]