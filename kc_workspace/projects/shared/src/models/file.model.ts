import {UuidModel} from "./uuid.model";

export class FileModel {
  filename: string;
  size: number;
  path: string;
  id: UuidModel;
  private accessTime: string;
  private modificationTime: string;
  private creationTime: string;

  constructor(filename: string, size: number, path: string, id: UuidModel) {
    this.filename = filename;
    this.id = id;
    this.size = size;
    this.path = path;
    this.accessTime = Date();
    this.modificationTime = Date();
    this.creationTime = Date();
  }
}