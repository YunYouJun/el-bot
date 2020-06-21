import { MessageType } from "../..";

function Quote(messageId: number): MessageType.Quote {
  return {
    type: 'quote',
    id: messageId
  };
}

function At(target: number): MessageType.At {
  return {
    type: "At",
    target,
    display: ""
  };
};

function AtAll(): MessageType.AtAll {
  return {
    type: "AtAll"
  };
}

function Face(faceId: number, name: string = ''): MessageType.Face {
  return {
    type: "Face",
    faceId,
    name
  };
}

function Plain(text: string): MessageType.Plain {
  return {
    type: "Plain",
    text
  };
}

function Image(imageId: string, url: string, path: string = ''): MessageType.Image {
  return {
    type: "Image",
    imageId,
    url,
    path
  };
}

function FlashImage(imageId: string, url: string, path: string = ''): MessageType.FlashImage {
  return {
    type: "FlashImage",
    imageId,
    url,
    path
  };
}

function Xml(xml: string): MessageType.Xml {
  return {
    type: "Xml",
    xml
  };
}

function Json(json: string): MessageType.Json {
  return {
    type: "Json",
    json
  };
}

function App(content: string): MessageType.App {
  return {
    type: "App",
    content
  };
}

function Poke(name: MessageType.Pokes): MessageType.Poke {
  return {
    type: "Poke",
    name
  };
}

export default {
  Quote,
  At,
  AtAll,
  Face,
  Plain,
  Image,
  FlashImage,
  Xml,
  Json,
  App,
  Poke
};
